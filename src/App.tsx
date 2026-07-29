import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import Analytics from '@/pages/Analytics';
import Clients from '@/pages/Clients';
import Suppliers from '@/pages/Suppliers';
import Products from '@/pages/Products';
import Employees from '@/pages/Employees';
import BulkUpload from '@/pages/BulkUpload';
import Tenders from '@/pages/Tenders';
import TenderDetail from '@/pages/TenderDetail';
import Eligibility from '@/pages/Eligibility';
import BidDecision from '@/pages/BidDecision';
import Estimation from '@/pages/Estimation';
import DocumentCenter from '@/pages/DocumentCenter';
import DocumentEditor from '@/pages/DocumentEditor';
import Dms from '@/pages/Dms';
import DocTracker from '@/pages/DocTracker';
import Payments from '@/pages/Payments';
import Deadlines from '@/pages/Deadlines';
import Bonds from '@/pages/Bonds';
import Contracts from '@/pages/Contracts';
import Risks from '@/pages/Risks';
import Approvals from '@/pages/Approvals';
import Crm from '@/pages/Crm';
import Reports from '@/pages/Reports';
import Search from '@/pages/Search';
import Audit from '@/pages/Audit';
import Profile from '@/pages/Profile';
import Users from '@/pages/Users';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="clients" element={<Clients />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="products" element={<Products />} />
        <Route path="employees" element={<Employees />} />
        <Route path="bulk-upload" element={<BulkUpload />} />
        <Route path="tenders" element={<Tenders />} />
        <Route path="tenders/:id" element={<TenderDetail />} />
        <Route path="eligibility" element={<Eligibility />} />
        <Route path="bid-decision" element={<BidDecision />} />
        <Route path="estimation" element={<Estimation />} />
        <Route path="documents" element={<DocumentCenter />} />
        <Route path="documents/new/:type" element={<DocumentEditor />} />
        <Route path="dms" element={<Dms />} />
        <Route path="doc-tracker" element={<DocTracker />} />
        <Route path="payments" element={<Payments />} />
        <Route path="deadlines" element={<Deadlines />} />
        <Route path="bonds" element={<Bonds />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="risks" element={<Risks />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="crm" element={<Crm />} />
        <Route path="reports" element={<Reports />} />
        <Route path="search" element={<Search />} />
        <Route path="audit" element={<Audit />} />
        <Route path="profile" element={<Profile />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
