/** Tab 1 — Company Details: the basics, contact, location. */
import { SectionCard, PF, BIG_INPUT } from './tabShared';
import type { FullProfile } from './profileExtras';
import { COMPANY_TYPES, KENYAN_COUNTIES } from './profileExtras';

export interface ScalarTabProps {
  profile: FullProfile;
  dirty: Set<string>;
  onScalar: <K extends keyof FullProfile>(key: K, value: FullProfile[K]) => void;
}

export default function CompanyTab({ profile: p, dirty, onScalar }: ScalarTabProps) {
  return (
    <div className="space-y-4">
      <SectionCard title="The basics" intro="Your company's identity — this appears at the top of your invoices and quotations.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="Company Name" hint="This appears at the top of your invoices" dirty={dirty.has('name')} className="sm:col-span-2">
            <input className={BIG_INPUT} value={p.name} onChange={(e) => onScalar('name', e.target.value)} placeholder="Future Bright Ventures Ltd" />
          </PF>
          <PF label="Trading Name" hint="If you trade under a different name" dirty={dirty.has('tradingName')}>
            <input className={BIG_INPUT} value={p.tradingName} onChange={(e) => onScalar('tradingName', e.target.value)} placeholder="e.g. FBV Supplies" />
          </PF>
          <PF label="Tagline" dirty={dirty.has('tagline')}>
            <input className={BIG_INPUT} value={p.tagline} onChange={(e) => onScalar('tagline', e.target.value)} placeholder="Quality supplies. Reliable service." />
          </PF>
          <PF label="Company Type" dirty={dirty.has('companyType')}>
            <select className={BIG_INPUT} value={p.companyType} onChange={(e) => onScalar('companyType', e.target.value)}>
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </PF>
          <PF label="Year Founded" dirty={dirty.has('yearFounded')}>
            <input className={BIG_INPUT} value={p.yearFounded} onChange={(e) => onScalar('yearFounded', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 2019" inputMode="numeric" />
          </PF>
        </div>
      </SectionCard>

      <SectionCard title="How clients reach you" intro="Printed in the header of every document you generate.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="Phone" dirty={dirty.has('phone')}>
            <input className={BIG_INPUT} value={p.phone} onChange={(e) => onScalar('phone', e.target.value)} placeholder="+254 700 123 456" />
          </PF>
          <PF label="Alt Phone" dirty={dirty.has('altPhone')}>
            <input className={BIG_INPUT} value={p.altPhone} onChange={(e) => onScalar('altPhone', e.target.value)} placeholder="+254 700 000 000" />
          </PF>
          <PF label="Email" dirty={dirty.has('email')}>
            <input className={BIG_INPUT} type="email" value={p.email} onChange={(e) => onScalar('email', e.target.value)} placeholder="info@fbv.co.ke" />
          </PF>
          <PF label="Website" dirty={dirty.has('website')}>
            <input className={BIG_INPUT} value={p.website} onChange={(e) => onScalar('website', e.target.value)} placeholder="www.fbv.co.ke" />
          </PF>
        </div>
      </SectionCard>

      <SectionCard title="Where you are" intro="Your physical and postal address as it should appear on documents.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PF label="Physical Address" dirty={dirty.has('address')} className="sm:col-span-2">
            <input className={BIG_INPUT} value={p.address} onChange={(e) => onScalar('address', e.target.value)} placeholder="3rd Floor, Bright House, Moi Avenue" />
          </PF>
          <PF label="Town / City" dirty={dirty.has('city')}>
            <input className={BIG_INPUT} value={p.city} onChange={(e) => onScalar('city', e.target.value)} placeholder="Nairobi" />
          </PF>
          <PF label="County" dirty={dirty.has('county')}>
            <select className={BIG_INPUT} value={p.county} onChange={(e) => onScalar('county', e.target.value)}>
              {KENYAN_COUNTIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </PF>
          <PF label="Postal Address" dirty={dirty.has('poBox')}>
            <input className={BIG_INPUT} value={p.poBox} onChange={(e) => onScalar('poBox', e.target.value)} placeholder="P.O. Box 12345-00100" />
          </PF>
          <PF label="Country" dirty={dirty.has('country')}>
            <input className={BIG_INPUT} value={p.country} onChange={(e) => onScalar('country', e.target.value)} placeholder="Kenya" />
          </PF>
        </div>
      </SectionCard>
    </div>
  );
}
