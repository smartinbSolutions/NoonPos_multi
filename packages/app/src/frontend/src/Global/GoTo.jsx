import { Link } from "react-router-dom";
import {
  User,
  Truck,
  Handshake,
  Wallet,
  ShoppingCart,
  CreditCard,
  BanknoteArrowDown,
  ArrowRightLeft,
  Receipt,
  Package,
  Layers,
} from "lucide-react";

const ROUTES = {
  customer: (id) => `/payment/customer/${id}`,
  supplier: (id) => `/payment/supplier/${id}`,
  partner: (id) => `/payment/partner/${id}`,
  fund: (id) => `/fund/${id}`,
  sales: (id) => `/view-sales/${id}`,
  sale: (id) => `/view-sales/${id}`,
  sales_return: (id) => `/view-sales-return/${id}`,
  purchase: (id) => `/view-purchase/${id}`,
  purchase_return: (id) => `/view-purchase-return/${id}`,
  expense: (id) => `/view-expense/${id}`,
  expense_category: (id) => `/expense-category/${id}`,
  payment: (id) => `/payments/${id}`,
  transfer: (id) => `/funds/transfers/${id}`,

  // product_movements.reference_type actual values
  products: (id) => `/products/${id}`,
  purchase_invoice: (id) => `/view-purchase/${id}`,
  sales_invoice: (id) => `/view-sales/${id}`,
};

const ICONS = {
  customer: User,
  supplier: Truck,
  partner: Handshake,
  fund: Wallet,
  sales: ShoppingCart,
  purchase: CreditCard,
  expense: BanknoteArrowDown,
  expense_category: Layers,
  payment: Receipt,
  transfer: ArrowRightLeft,

  products: Package,
  purchase_invoice: CreditCard,
  sales_invoice: ShoppingCart,
};

const VARIANT_STYLES = {
  solid: {
    active: "bg-[#eef3ff] text-[#4663ff] hover:bg-[#4663ff]/15",
    disabled: "bg-slate-100 text-slate-500",
  },
  light: {
    active:
      "border border-slate-200 bg-transparent text-slate-600 hover:border-[#4663ff]/40 hover:bg-[#f6f8fd] hover:text-[#4663ff]",
    disabled: "border border-slate-100 bg-transparent text-slate-400",
  },
};

export default function GoTo({
  type,
  id,
  children,
  className = "",
  variant = "solid",
}) {
  const routeFn = ROUTES[type];
  const Icon = ICONS[type];
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.solid;

  if (!routeFn || !id) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition ${styles.disabled} ${className}`}
      >
        {Icon && <Icon size={11} />}
        {children}
      </span>
    );
  }

  return (
    <Link
      to={routeFn(id)}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition ${styles.active} ${className}`}
    >
      {Icon && <Icon size={11} />}
      {children}
    </Link>
  );
}
