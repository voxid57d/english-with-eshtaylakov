import { createRoot } from "react-dom/client";
import PrivateFinanceApp from "../../components/private-finance/PrivateFinanceApp";
import { offlineFinance } from "../../lib/offlineFinance";
import "./reset.css";

createRoot(document.getElementById("root")!).render(<PrivateFinanceApp offline transport={offlineFinance} />);
