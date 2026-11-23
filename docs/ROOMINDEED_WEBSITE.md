# RoomIndeed website <-> KirayaSaathi

Run `supabase/09_roomindeed_live.sql` once (Supabase > SQL Editor). The website uses the **anon key** and only these 3 functions.

## 1. Show live properties
```js
const { data } = await supabase.rpc('api_public_listings', {
  p: { type: 'NON_BED', unit_type: '1bhk', min_rent: 3000, max_rent: 12000, amenities: ['ac'], search: 'Gorakhpur', limit: 20, offset: 0 },
})
// data = { total, items: [{ id, name, address, type, unit_types, amenities, photo_keys, min_rent, security_deposit, vacant, live_at }] }
```
Photo address: `${SUPABASE_URL}/storage/v1/object/public/listings/${photo_key}`

Property detail page: `supabase.rpc('api_public_listing', { p: { id } })`

`type` is `BED` (unit types: `hostel`, `pg`) or `NON_BED` (`private_room`, `1rk`, `1bhk`, `2bhk`, `3bhk`).
Amenity keys: `ac car_parking bike_parking bed mattress wifi geyser fridge tv washing_machine wardrobe power_backup lift cctv meals housekeeping attached_bath balcony ro_water`.

Only properties the owner made **Live** in the app are returned. The owner phone number is never sent.

## 2. Enquiry button (property card and detail page)
```js
await supabase.rpc('api_public_enquiry', {
  p: { property_id: 123, name: 'Rahul', phone: '9876543210', message: 'Is the room available from 1st?' },
})
// several properties: property_ids: [123, 456]  (max 5)
```
The lead appears in the owner's **Leads** with the property name (badge "From RoomIndeed").
If the properties belong to different owners, each owner gets their own lead.
The same phone number enquiring again within 24 hours is added to the same lead.

## 3. Spam
The function allows 5 website enquiries per phone number per hour. Before launch also add a CAPTCHA (Cloudflare Turnstile) on the enquiry form, and ideally send the enquiry through a Supabase Edge Function that checks the CAPTCHA and then calls `api_public_enquiry`.
