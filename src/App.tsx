import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import PageStub from '@/pages/PageStub';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<PageStub title="Analytics" />} />
        <Route path="clients" element={<PageStub title="Clients" />} />
        <Route path="suppliers" element={<PageStub title="Suppliers" />} />
        <Route path="products" element={<PageStub title="Products" />} />
        <Route path="employees" element={<PageStub title="Employees" />} />
        <Route path="bulk-upload" element={<PageStub title="Bulk Upload Centre" />} />
        <Route path="tenders" element={<PageStub title="Tender Register" />} />
        <Route path="tenders/:id" element={<PageStub title="Tender Detail" />} />
        <Route path="eligibility" element={<PageStub title="Eligibility Checker" />} />
        <Route path="bid-decision" element={<PageStub title="Bid / No-Bid Decision" />} />
        <Route path="estimation" element={<PageStub title="Cost Estimation & BOQ" />} />
        <Route path="documents" element={<PageStub title="Document Center" />} />
        <Route path="documents/new/:type" element={<PageStub title="New Document" />} />
        <Route path="dms" element={<PageStub title="Business Documents" />} />
        <Route path="doc-tracker" element={<PageStub title="Document Tracker" />} />
        <Route path="payments" element={<PageStub title="Payments" />} />
        <Route path="deadlines" element={<PageStub title="Deadline Tracker" />} />
        <Route path="bonds" element={<PageStub title="Bid Bonds" />} />
        <Route path="contracts" element={<PageStub title="Contracts & Milestones" />} />
        <Route path="risks" element={<PageStub title="Risk Register" />} />
        <Route path="approvals" element={<PageStub title="Approvals" />} />
        <Route path="crm" element={<PageStub title="CRM Log" />} />
        <Route path="reports" element={<PageStub title="Reports" />} />
        <Route path="search" element={<PageStub title="Global Search" />} />
        <Route path="audit" element={<PageStub title="Audit Trail" />} />
        <Route path="profile" element={<PageStub title="Company Profile" />} />
        <Route path="users" element={<PageStub title="Users & Roles" />} />
        <Route path="settings" element={<PageStub title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
