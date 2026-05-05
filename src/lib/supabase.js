// src/lib/supabase.js
// Central Supabase client + all API helpers used by the React app.
// Import from this file everywhere — never create a second client.

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function registerParent({ name, email, password, phone, location }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone, location, role: "parent" },
    },
  });
  if (error) throw error;
  return data;
}

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { ...data, email: user.email };
}

// ─────────────────────────────────────────────────────────────
// PROFILES (admin use)
// ─────────────────────────────────────────────────────────────

export async function getAllParents() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, children(*)")
    .eq("role", "parent")
    .order("name");
  if (error) throw error;
  return data;
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteParent(id) {
  // Deleting the profile cascades to children and orders via FK
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// CHILDREN
// ─────────────────────────────────────────────────────────────

export async function getMyChildren(parentId) {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", parentId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function upsertChild(child) {
  // child: { id?, parent_id, name, grade, dietary_selected, dietary_other }
  const { data, error } = await supabase
    .from("children")
    .upsert(child, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChild(id) {
  const { error } = await supabase.from("children").delete().eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// MENU
// ─────────────────────────────────────────────────────────────

// Fetch menu days + items for a date range
export async function getMenuRange(from, to) {
  const { data, error } = await supabase
    .from("menu_days")
    .select("*, menu_items(*)")
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw error;

  // Convert to { 'YYYY-MM-DD': { items: [...], available: bool } }
  return Object.fromEntries(
    data.map((day) => [
      day.date,
      {
        id: day.id,
        available: day.available,
        items: (day.menu_items || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => ({ id: i.id, name: i.name, price: i.price })),
      },
    ])
  );
}

// Replicate a 2-week menu pattern across future weeks.
//   sourceStart: ISO date of the Monday of pattern week 1 (e.g. "2026-05-04")
//   targetStart: ISO date of the Monday of the first week to fill in
//   weeksCount:  how many weeks to fill in
// Returns number of weekdays written.
export async function applyMenuRotation(sourceStart, targetStart, weeksCount) {
  const { data, error } = await supabase.rpc("apply_menu_rotation", {
    source_start: sourceStart,
    target_start: targetStart,
    weeks_count:  weeksCount,
  });
  if (error) throw error;
  return data; // integer count
}

// Save a full menu day (replaces all items for that date)
export async function saveMenuDay(date, items) {
  // 1. Upsert the menu_day row
  const { data: day, error: dayErr } = await supabase
    .from("menu_days")
    .upsert({ date, available: true, updated_at: new Date().toISOString() }, { onConflict: "date" })
    .select()
    .single();
  if (dayErr) throw dayErr;

  // 2. Delete existing items for this day
  const { error: delErr } = await supabase
    .from("menu_items")
    .delete()
    .eq("menu_day_id", day.id);
  if (delErr) throw delErr;

  // 3. Insert new items
  if (items.length > 0) {
    const rows = items.map((item, idx) => ({
      menu_day_id: day.id,
      name: item.name,
      price: item.price,
      sort_order: idx,
    }));
    const { error: insErr } = await supabase.from("menu_items").insert(rows);
    if (insErr) throw insErr;
  }

  return day;
}

// ─────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────

export async function getOrders({ date, location, parentId } = {}) {
  let q = supabase
    .from("order_details")  // uses the view
    .select("*");

  if (date)     q = q.eq("order_date", date);
  if (location) q = q.eq("location", location);
  if (parentId) q = q.eq("parent_id", parentId);

  q = q.order("order_date", { ascending: true });

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function placeOrder({ parentId, childId, menuDayId, menuItemId, itemName, itemPrice, drink, location, orderDate }) {
  const { data, error } = await supabase
    .from("orders")
    .insert({
      parent_id:    parentId,
      child_id:     childId,
      menu_day_id:  menuDayId,
      menu_item_id: menuItemId,
      item_name:    itemName,
      item_price:   itemPrice,
      drink,
      location,
      order_date:   orderDate,
    })
    .select()
    .single();
  if (error) throw error;  // DB trigger will reject if past 8 AM cutoff
  return data;
}

export async function cancelOrder(orderId) {
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;  // DB trigger will reject if past 8 AM cutoff
}

// ─────────────────────────────────────────────────────────────
// BLOCKED DAYS
// ─────────────────────────────────────────────────────────────

export async function getBlockedDays() {
  const { data, error } = await supabase
    .from("blocked_days")
    .select("*")
    .order("date");
  if (error) throw error;

  // Convert to { 'YYYY-MM-DD': { label, locations } }
  return Object.fromEntries(
    data.map((row) => [row.date, { id: row.id, label: row.label, locations: row.location }])
  );
}

export async function addBlockedDay({ date, label, location }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("blocked_days")
    .insert({ date, label, location, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeBlockedDay(id) {
  const { error } = await supabase.from("blocked_days").delete().eq("id", id);
  if (error) throw error;
}

// Block every date from startDate to endDate (inclusive) at one location.
// Existing same (date, location) rows are upserted (label updated).
// Returns the inserted/updated rows.
export async function addBlockedDayRange({ startDate, endDate, label, location }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Build list of date strings in [startDate, endDate] inclusive.
  const dates = [];
  const cur = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  if (end < cur) throw new Error("End date is before start date.");
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const rows = dates.map((d) => ({
    date: d, label, location, created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("blocked_days")
    .upsert(rows, { onConflict: "date,location" })
    .select();
  if (error) throw error;
  return data;
}

// Bulk delete by id (used when removing a grouped range from the UI).
export async function removeBlockedDays(ids) {
  if (!ids?.length) return;
  const { error } = await supabase.from("blocked_days").delete().in("id", ids);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export async function getNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// Trigger the Edge Function to email all parents
export async function notifyMenuChange(date, items) {
  const { data, error } = await supabase.functions.invoke("notify-menu-change", {
    body: { date, items },
  });
  if (error) throw error;
  return data;
}

// ──────────────────────────────────