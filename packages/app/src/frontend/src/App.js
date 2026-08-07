import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "react-toastify/dist/ReactToastify.css";

import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";

import "@fontsource/almarai/300.css";
import "@fontsource/almarai/400.css";
import "@fontsource/almarai/700.css";
import "@fontsource/almarai/800.css";

import Layout from "./Layout";
import { AuthProvider, useAuth } from "./Global/AuthContext";
import LoginScreen from "./components/Auth/component/LoginScreen";
import ActivationPage from "./renderer/ActivationPage";
import SetupPage from "./components/SetupPage/components/SetupPage";

import Dashboard from "./pages/DashboardPage";
import POSSystem from "./components/PosPoint/components/POSSystem";

// Sales
import SalesList from "./components/Invoices/Sales/components/SalesList";
import AddSales from "./components/Invoices/Sales/components/AddSales";
import UpdateSales from "./components/Invoices/Sales/components/UpdateSales";
import SalesInvoiceView from "./components/Invoices/Sales/components/SalesInvoiceView";
import { CustomerList } from "./components/Customer/components/CustomerList";

// Purchase
import PurchaseList from "./components/Invoices/Purchase/components/PurchaseList";
import AddPurchase from "./components/Invoices/Purchase/components/AddPurchase";
import UpdatePurchase from "./components/Invoices/Purchase/components/UpdatePurchase";
import PurchaseInvoiceView from "./components/Invoices/Purchase/components/PurchaseInvoiceView";
import { SuppliersList } from "./components/Supplier/components/SuppliersList";

// Expenses
import ExpenseList from "./components/Invoices/expense/components/ExpenseList";
import AddExpense from "./components/Invoices/expense/components/AddExpense";
import UpdateExpense from "./components/Invoices/expense/components/UpdateExpense";
import ExpenseView from "./components/Invoices/expense/components/ExpenseView";
import ExpenseCategoryList from "./components/ExpenseCategory/components/ExpenseCategoryList";

// Cash / Funds
import FundList from "./components/Cash/Fund/components/FundList";
import FundMovementsPage from "./components/Cash/Fund/components/FundMovementsPage";
import FundTransferList from "./components/Cash/Fund/components/FundTransferList";
import PaymentList from "./components/Cash/Payment/components/paymentList";
import PartyLedgerPage from "./components/Payment/components/PartyLedgerPage";
import CurrencyList from "./components/Cash/Currency/components/CurrencyList";

// Products
import ProductList from "./components/Products/components/productList";
import ImportSummary from "./components/Products/components/ImportSummary";

// Partners
import PartnersList from "./components/Partners/components/PartnersList";

// Settings
import UnitList from "./components/Unit/components/UnitList";
import TaxList from "./components/Tax/components/TaxList";
import UsersList from "./components/users/components/UsersList";
import PurchaseReturnList from "./components/Invoices/PurchaseReturn/components/PurchaseReturnList";
import PurchaseReturnView from "./components/Invoices/PurchaseReturn/components/PurchaseRefundView";
import SalesReturnList from "./components/Invoices/SalesReturn/components/SalesReturnList";
import SalesReturnView from "./components/Invoices/SalesReturn/components/SalesReturnView";
import PaymentDocumentPage from "./components/Cash/Payment/components/PaymentDocumentPage";
import FundTransferDocumentPage from "./components/Cash/Fund/components/FundTransferDocumentPage";
import ProductDetailPage from "./components/Products/components/ProductDetailPage";
import ProductFormPage from "./components/Products/components/ProductFormPage";
import PurchaseReturnPage from "./components/Invoices/PurchaseReturn/components/PurchaseReturnPage";
import SalesReturnPage from "./components/Invoices/SalesReturn/components/SalesReturnPage";
import CompanyGeneralInfo from "./components/CompanySettings/components/CompanyGeneralInfo";
import CompanyBusinessSettings from "./components/CompanySettings/components/CompanyBusinessSettings";
import PrintSalesInvoice from "./components/Invoices/Sales/components/PrintSalesInvoice";
import PrintSalesReturn from "./components/Invoices/SalesReturn/components/PrintSalesReturn";
import PrintPurchaseInvoice from "./components/Invoices/Purchase/components/PrintPurchaseInvoice";
import PrintPurchaseReturn from "./components/Invoices/PurchaseReturn/components/PrintPurchaseReturn";
import PrintPayment from "./components/Cash/Payment/components/PrintPayment";
import PrintExpense from "./components/Invoices/expense/components/PrintExpense";
import ExpenseCategoryDetailPage from "./components/ExpenseCategory/components/ExpenseCategoryDetailPage";
import SalesQuotationList from "./components/Invoices/SalesQuotations/components/SalesQuotationList";
import AddSalesQuotation from "./components/Invoices/SalesQuotations/components/AddSalesQuotation";
import UpdateSalesQuotation from "./components/Invoices/SalesQuotations/components/UpdateSalesQuotation";
import PrintSalesQuotation from "./components/Invoices/SalesQuotations/components/PrintSalesQuotation";
import SalesQuotationView from "./components/Invoices/SalesQuotations/components/SalesQuotationView";
import ProfitLossReport from "./components/Reports/components/ProfitLossReport";
import SalesReport from "./components/Reports/components/SalesReport";
import PrintProfitLossReport from "./components/Reports/components/PrintProfitLossReport";
import PrintSalesByProduct from "./components/Reports/components/PrintSalesByProduct";
import PrintSalesByCustomer from "./components/Reports/components/PrintSalesByCustomer";

/* ================= ROUTE GUARDS ================= */

// pos-role users can only ever see /pos — anything else redirects them there
function PosGate({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.role === "pos" && location.pathname !== "/pos") {
    return <Navigate to="/pos" replace />;
  }

  return children;
}

// admin-only routes (e.g. Users management)
function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

// blocks the whole app until a PIN is entered
function AuthGate({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginScreen />;
  return children;
}

export default function App() {
  const { t } = useTranslation();
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [isSetup, setIsSetup] = useState(null);

  useEffect(() => {
    const checkLicense = async () => {
      try {
        const status = await window.license?.status();
        setLicenseStatus(status || { valid: false, reason: "missing_license" });
      } catch (err) {
        console.error(err);
        setLicenseStatus({ valid: false, reason: "missing_license" });
      }
    };

    checkLicense();
  }, []);

  useEffect(() => {
    if (!licenseStatus?.valid) return;

    const check = async () => {
      try {
        const res = await window.api.getCompanySetting();
        setIsSetup(!!res?.exists);
      } catch (err) {
        console.error(err);
        setIsSetup(false);
      }
    };

    check();
  }, [licenseStatus]);

  if (licenseStatus === null) return <div>{t("common.loading")}</div>;

  if (!licenseStatus.valid) {
    return (
      <ActivationPage
        reason={licenseStatus.reason}
        onActivated={() => setLicenseStatus({ valid: true })}
      />
    );
  }

  if (isSetup === null) return <div>{t("common.loading")}</div>;

  return (
    <HashRouter>
      <Routes>
        {/* ================= SETUP MODE ================= */}
        {!isSetup ? (
          <>
            <Route
              path="/setup"
              element={<SetupPage onSetupComplete={() => setIsSetup(true)} />}
            />
            <Route path="*" element={<Navigate to="/setup" />} />
          </>
        ) : (
          <>
            <Route
              path="/"
              element={
                <AuthProvider>
                  <AuthGate>
                    <PosGate>
                      <Layout />
                    </PosGate>
                  </AuthGate>
                </AuthProvider>
              }
            >
              {/* ================= CORE ================= */}
              <Route index element={<Dashboard />} />
              <Route path="pos" element={<POSSystem />} />

              {/* ================= SALES ================= */}
              <Route path="sales" element={<SalesList />} />
              <Route path="add-sales" element={<AddSales />} />
              <Route path="view-sales/:id" element={<SalesInvoiceView />} />
              <Route path="edit-sales/:id" element={<UpdateSales />} />
              <Route path="customer" element={<CustomerList />} />

              {/* ================= SALES QUOTATIONS ================= */}
              <Route path="sales-quotations" element={<SalesQuotationList />} />
              <Route
                path="add-sales-quotation"
                element={<AddSalesQuotation />}
              />
              <Route
                path="view-sales-quotation/:id"
                element={<SalesQuotationView />}
              />
              <Route
                path="edit-sales-quotation/:id"
                element={<UpdateSalesQuotation />}
              />

              {/* ================= SALES RETURN ================= */}
              <Route path="/sales-return" element={<SalesReturnList />} />
              <Route
                path="sales-return/:invoiceId"
                element={<SalesReturnPage />}
              />
              <Route
                path="/view-sales-return/:id"
                element={<SalesReturnView />}
              />

              {/* ================= PURCHASE ================= */}
              <Route path="purchase" element={<PurchaseList />} />
              <Route path="add-purchase" element={<AddPurchase />} />
              <Route
                path="view-purchase/:id"
                element={<PurchaseInvoiceView />}
              />
              <Route path="edit-purchase/:id" element={<UpdatePurchase />} />
              <Route path="supplier" element={<SuppliersList />} />

              {/* ================= PURCHASE RETURN ================= */}
              <Route path="/purchase-return" element={<PurchaseReturnList />} />
              <Route
                path="purchase-return/:invoiceId"
                element={<PurchaseReturnPage />}
              />
              <Route
                path="view-purchase-return/:id"
                element={<PurchaseReturnView />}
              />

              {/* ================= EXPENSES ================= */}
              <Route path="expense" element={<ExpenseList />} />
              <Route path="add-expense" element={<AddExpense />} />
              <Route path="edit-expense/:id" element={<UpdateExpense />} />
              <Route path="view-expense/:id" element={<ExpenseView />} />
              <Route
                path="expense-category"
                element={<ExpenseCategoryList />}
              />
              <Route
                path="expense-category/:id"
                element={<ExpenseCategoryDetailPage />}
              />

              {/* ================= CASH / FUNDS ================= */}
              <Route path="funds" element={<FundList />} />
              <Route path="fund/:id" element={<FundMovementsPage />} />
              <Route path="fundTransfer" element={<FundTransferList />} />
              <Route path="payments" element={<PaymentList />} />
              <Route path="payment/:type/:id" element={<PartyLedgerPage />} />
              <Route path="currency" element={<CurrencyList />} />
              <Route path="/payments/:id" element={<PaymentDocumentPage />} />
              <Route
                path="/funds/transfers/:id"
                element={<FundTransferDocumentPage />}
              />

              {/* ================= PRODUCTS ================= */}
              <Route path="products" element={<ProductList />} />
              <Route path="products/new" element={<ProductFormPage />} />
              <Route path="products/:id/edit" element={<ProductFormPage />} />
              <Route path="products/:id" element={<ProductDetailPage />} />
              <Route path="import-reports" element={<ImportSummary />} />

              {/* ================= PARTNERS ================= */}
              <Route path="partners" element={<PartnersList />} />
              {/* ================= REPORTS ================= */}
              <Route
                path="/reports/profit-loss"
                element={<ProfitLossReport />}
              />
              <Route path="/reports/sales" element={<SalesReport />} />

              {/* ================= SETTINGS ================= */}
              <Route path="unit" element={<UnitList />} />
              <Route path="tax" element={<TaxList />} />
              <Route path="company-info" element={<CompanyGeneralInfo />} />
              <Route
                path="company-settings"
                element={<CompanyBusinessSettings />}
              />
              <Route
                path="users"
                element={
                  <AdminRoute>
                    <UsersList />
                  </AdminRoute>
                }
              />
            </Route>
            <Route path="/print-sales/:id" element={<PrintSalesInvoice />} />
            <Route
              path="/print-sales-quotation/:id"
              element={<PrintSalesQuotation />}
            />
            <Route
              path="/print-sales-return/:id"
              element={<PrintSalesReturn />}
            />
            <Route
              path="/print-purchase/:id"
              element={<PrintPurchaseInvoice />}
            />
            <Route
              path="/print-purchase-return/:id"
              element={<PrintPurchaseReturn />}
            />
            <Route path="/print-payment/:id" element={<PrintPayment />} />
            <Route path="/print-expense/:id" element={<PrintExpense />} />
            <Route
              path="/print-profit-loss"
              element={<PrintProfitLossReport />}
            />
            <Route
              path="/print-sales-by-product"
              element={<PrintSalesByProduct />}
            />
            <Route
              path="/print-sales-by-customer"
              element={<PrintSalesByCustomer />}
            />
            {/* fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
}
