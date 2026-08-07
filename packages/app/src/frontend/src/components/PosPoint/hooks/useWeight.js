import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const useWeight = ({ setCurrentWeight, baudRate = 9600 } = {}) => {
  const { t } = useTranslation();
  const [weight, setWeight] = useState(0);
  const [status, setStatus] = useState(t("screens.pos.disconnected"));
  const [isConnected, setIsConnected] = useState(false);
  const [ports, setPorts] = useState([]);

  const setCurrentWeightRef = useRef(setCurrentWeight);

  const getDefaultPortPath = useCallback((availablePorts) => {
    const preferredPort =
      availablePorts.find((port) => {
        const label = [
          port.path,
          port.manufacturer,
          port.friendlyName,
          port.pnpId,
          port.vendorId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          label.includes("usb") ||
          label.includes("ftdi") ||
          label.includes("prolific") ||
          label.includes("ch340")
        );
      }) || availablePorts[0];

    return preferredPort?.path || "";
  }, []);

  useEffect(() => {
    setCurrentWeightRef.current = setCurrentWeight;
  }, [setCurrentWeight]);

  useEffect(() => {
    const api = window.api;

    if (!api?.onScaleData || !api?.onScaleStatus) {
      setStatus(t("screens.pos.scaleApiUnavailable"));
      return undefined;
    }

    api
      .getScaleStatus?.()
      .then((payload) => {
        setIsConnected(Boolean(payload?.connected));
        setStatus(t("screens.pos.disconnected"));

        const nextWeight = Number(payload?.weight);

        if (Number.isFinite(nextWeight) && nextWeight > 0) {
          setWeight(nextWeight);
          setCurrentWeightRef.current?.(nextWeight);
        }
      })
      .catch((error) => {
        console.error("Failed to read scale status:", error);
      });

    const removeDataListener = api.onScaleData((payload) => {
      const nextWeight = Number(payload?.weight);

      if (!Number.isFinite(nextWeight)) return;

      setWeight(nextWeight);
      setCurrentWeightRef.current?.(nextWeight);
    });

    const removeStatusListener = api.onScaleStatus((payload) => {
      setIsConnected(Boolean(payload?.connected));
      setStatus(t("screens.pos.disconnected"));
    });

    return () => {
      removeDataListener?.();
      removeStatusListener?.();
    };
  }, []);

  const refreshPorts = useCallback(async () => {
    const api = window.api;

    if (!api?.listScalePorts) {
      setStatus(t("screens.pos.scaleApiUnavailable"));
      return [];
    }

    const availablePorts = await api.listScalePorts();
    setPorts(availablePorts || []);
    return availablePorts || [];
  }, []);

  const connect = useCallback(
    async (path) => {
      const api = window.api;

      if (!api?.connectScale) {
        setStatus(t("screens.pos.scaleApiUnavailable"));
        return;
      }

      setStatus(t("screens.pos.connectingScale"));

      try {
        const availablePorts = await refreshPorts();
        const selectedPath = path || getDefaultPortPath(availablePorts);
        const result = await api.connectScale({ path: selectedPath, baudRate });

        if (!result?.ok) {
          setIsConnected(false);
          setStatus(result?.message || t("screens.pos.scaleConnectionFailed"));
          return;
        }

        setIsConnected(true);
        setStatus(t("screens.pos.connectedTo", { path: result.path }));
      } catch (error) {
        console.error("Scale connection failed:", error);
        setIsConnected(false);
        setStatus(t("screens.pos.scaleConnectionFailed"));
      }
    },
    [baudRate, getDefaultPortPath, refreshPorts],
  );

  const close = useCallback(async () => {
    const api = window.api;

    if (!api?.disconnectScale) return;

    await api.disconnectScale();
    setIsConnected(false);
    setStatus(t("screens.pos.disconnected"));
    setWeight(0);
    setCurrentWeightRef.current?.(0);
  }, []);

  useEffect(() => {
    refreshPorts().catch((error) => {
      console.error("Failed to list scale ports:", error);
      setStatus(error?.message || t("screens.pos.listScalePortsFailed"));
    });
  }, [refreshPorts]);

  return { weight, status, isConnected, ports, connect, close, refreshPorts };
};

export default useWeight;
