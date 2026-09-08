<#
.SYNOPSIS
  Sends a file's raw bytes to a Windows printer as a RAW spool job,
  bypassing GDI/driver rendering entirely.

.DESCRIPTION
  Standalone port of Microsoft's classic RawPrinterHelper (winspool.drv
  P/Invoke) sample. Used as the ESC/POS raw-print backend for printers
  that reject Electron's silent print pipeline (e.g. PT80KM/POS80 clones).

  This script has NO dependency on Node, Electron, or any native npm
  module -- it only needs PowerShell and the Windows printer driver
  already installed and working (confirmed by your Windows Test Page).

.PARAMETER PrinterName
  Exact Windows printer 'deviceName' as returned by getPrintersAsync()
  or Get-Printer. Must match exactly -- this is looked up by name, not by
  port or driver.

.PARAMETER FilePath
  Path to a file containing the raw bytes to send (e.g. the ESC/POS
  buffer produced by escposRaster.js, written to a temp file by Node).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File send-raw-print.ps1 -PrinterName "POS80" -FilePath "C:\temp\receipt.bin"

.OUTPUTS
  Exit code 0 on success. Non-zero + message on stderr on failure --
  intended to be captured by the caller (Node child_process) for
  requirement #7 (real test-print error reporting).
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$PrinterName,

    [Parameter(Mandatory = $true)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

# ---- P/Invoke declarations for winspool.drv ----
# Mirrors Microsoft's documented RawPrinterHelper sample structure-for-structure.
$signature = @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes, out string error)
    {
        error = null;
        IntPtr hPrinter;
        IntPtr unmanagedBytes = IntPtr.Zero;

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            error = "OpenPrinter failed for '" + printerName + "' (Win32 error " + Marshal.GetLastWin32Error() + "). Check the printer name matches exactly.";
            return false;
        }

        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "NoonPos Receipt";
            di.pDataType = "RAW";

            if (!StartDocPrinter(hPrinter, 1, di))
            {
                error = "StartDocPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ").";
                return false;
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    error = "StartPagePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ").";
                    return false;
                }

                try
                {
                    unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

                    int written;
                    if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out written))
                    {
                        error = "WritePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ").";
                        return false;
                    }

                    if (written != bytes.Length)
                    {
                        error = "WritePrinter wrote " + written + " of " + bytes.Length + " bytes.";
                        return false;
                    }
                }
                finally
                {
                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            if (unmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanagedBytes);
            ClosePrinter(hPrinter);
        }

        return true;
    }
}
'@

Add-Type -TypeDefinition $signature -Language CSharp

# ---- Read the file as raw bytes and send ----
try {
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
}
catch {
    Write-Error "Failed to read file '$FilePath': $($_.Exception.Message)"
    exit 1
}

if ($bytes.Length -eq 0) {
    Write-Error "File '$FilePath' is empty -- nothing to print."
    exit 1
}

$errorMsg = $null
$ok = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes, [ref]$errorMsg)

if ($ok) {
    Write-Output "OK: sent $($bytes.Length) bytes to '$PrinterName'."
    exit 0
}
else {
    Write-Error $errorMsg
    exit 1
}
