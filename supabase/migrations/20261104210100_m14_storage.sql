-- M14: tender packs are stored next to contracts and invoices in the private "business" bucket.
-- Exports add a ZIP; uploaded tenders can be photos. Merged packs with attachments run larger.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/zip', 'image/jpeg', 'image/png'],
    file_size_limit = 52428800
where id = 'business';
