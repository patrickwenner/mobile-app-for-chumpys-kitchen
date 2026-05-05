// src/lib/supabase.js
// Central Supabase client + all API helpers used by the React app.

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
    email, password,
    options: { data: { name, phone, location, role: "parent" } },
  });
  if (error) throw error;
  return data;
}
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return { ...data, email: user.email };
}

export async function getAllParents() {
  const { data, error } = await supabase
    .from("profiles").select("*, children(*)").eq("role", "parent").order("name");
  if (error) throw error;
  return data;
}
export async function updateProfile(id, updates) {
  const { data, error } = await supabase.from("profiles").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteParent(id) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function getMyChildren(parentId) {
  const { data, error } = await supabase.from("children").select("*").eq("parent_id", parentId).order("name");
  if (error) throw error;
  return data;
}
export async function upsertChild(child) {
  const { data, error } = await supabase.from("children").upsert(child, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteChild(id) {
  const { error } = await supabase.from("children").delete().eq("id", id);
  if (error) throw error;
}

export async function getMenuRange(from, to) {
  const { data, error } = await supabase
    .from("menu_days").select("*, menu_items(*)").gte("date", from).lte("date", to).order("date");
  if (error) throw error;
  return Object.fromEntries(
    data.map((day) => [day.date, {
      id: day.id,
      available: day.available,
      items: (day.menu_items || []).sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ id: i.id, name: i.name, price: i.price })),
    }])
  );
}
export async function applyMenuRotation(sourceStart, targetStart, weeksCount) {
  const { data, error } = await supabase.rpc("apply_menu_rotation", {
    source_start: sourceStart, target_start: targetStart, weeks_count: weeksCount,
  });
  if (error) throw error;
  return data;
}
export async function saveMenuDay(date, items) {
  const { data: day, error: dayErr } = await supabase
    .from("menu_days")
    .upsert({ date, available: true, updated_at: new Date().toISOString() }, { onConflict: "date" })
    .select().single();
  if (dayErr) throw dayErr;
  const { error: delErr } = await supabase.from("menu_items").delete().eq("menu_day_id", day.id);
  if (delErr) throw delErr;
  if (items.length > 0) {
    const rows = items.map((item, idx) => ({
      menu_day_id: day.id, name: item.name, price: item.price, sort_order: idx,
    }));
    const { error: insErr } = await supabase.from("menu_items").insert(rows);
    if (insErr) throw insErr;
  }
  return day;
}

export async function getOrders({ date, location, parentId } = {}) {
  let q = supabase.from("order_details").select("*");
  if (date)     q = q.eq("order_date", date);
  if (location) q = q.eq("location", location);
  if (parentId) q = q.eq("parent_id", parentId);
  q = q.order("order_date", { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function placeOrder({ parentId, childId, menuDayId, menuItemId, itemName, itemPrice, drink, location, orderDate }) {
  const { data, error } = await supabase.from("orders").insert({
    parent_id: parentId, child_id: childId, menu_day_id: menuDayId, menu_item_id: menuItemId,
    item_name: itemName, item_price: itemPrice, drink, location, order_date: orderDate,
  }).select().single();
  if (error) throw error;
  return data;
}
export async function cancelOrder(orderId) {
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

export async function getBlockedDays() {
  const { data, error } = await supabase.from("blocked_days").select("*").order("date");
  if (error) throw error;
  return Object.fromEntries(
    data.map((row) => [row.date, { id: row.id, label: row.label, locations: row.location }])
  );
}
export async function addBlockedDay({ date, label, location }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("blocked_days").insert({ date, label, location, created_by: user.id }).select().single();
  if (error) throw error;
  return data;
}
export async function removeBlockedDay(id) {
  const { error } = await supabase.from("blocked_days").delete().eq("id", id);
  if (error) throw error;
}
export async function addBlockedDayRange({ startDate, endDate, label, location }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const dates = [];
  const cur = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  if (end < cur) throw new Error("End date is before start date.");
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  const rows = dates.map((d) => ({ date: d, label, location, created_by: user.id }));
  const { data, error } = await supabase.from("blocked_days").upsert(rows, { onConflict: "date,location" }).select();
  if (error) throw error;
  return data;
}
export async function removeBlockedDays(ids) {
  if (!ids?.length) return;
  const { error } = await supabase.from("blocked_days").delete().in("id", ids);
  if (error) throw error;
}

export async function getNotifications() {
  const { data, error } = await supabase.from("notifications").select("*").order("sent_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}
export async function notifyMenuChange(date, items) {
  const { data, error } = await supabase.functions.invoke("notify-menu-change", { body: { date, items } });
  if (error) throw error;
  return data;
}

export async function getMonthlyRevenue(location) {
  let q = supabase.from("monthly_revenue").select("*");
  if (location) q = q.eq("location", location);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getLocations() {
  const { data, error } = await supabase.from("locations").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return data.map(l => l.name);
}
export async function addLocation(name) {
  const { data, error } = await supabase.from("locations").insert({ name, active: true }).select().single();
  if (error) throw error;
  return data;
}
export async function renameLocation(oldName, newName) {
  const { error } = await supabase.from("locations").update({ name: newName }).eq("name", oldName);
  if (error) throw error;
  await supabase.from("profiles").update({ location: newName }).eq("location", oldName);
}
export async function deleteLocation(name) {
  const { error } = await supabase.from("locations").delete().eq("name", name);
  if (error) throw error;
}

export async function getDrinks() {
  const { data, error } = await supabase.from("drinks").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return data;
}
export async function addDrink({ name, emoji = "" }) {
  const { data: existing } = await supabase
    .from("drinks").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("drinks").insert({ name, emoji, sort_order: nextSort }).select().single();
  if (error) throw error;
  return data;
}
export async function updateDrink(id, updates) {
  const { data, error } = await supabase.from("drinks").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteDrink(id) {
  const { error } = await supabase.from("drinks").delete().eq("id", id);
  if (error) throw error;
}

export async function getMyRepeatOrders(parentId) {
  const { data, error } = await supabase
    .from("repeat_orders").select("*, children(name, grade)")
    .eq("parent_id", parentId).eq("active", true).order("weekday");
  if (error) throw error;
  return data;
}
export async function upsertRepeatOrder({ parentId, childId, weekday, itemIndex, drink, location }) {
  const { data, error } = await supabase
    .from("repeat_orders")
    .upsert({
      parent_id: parentId, child_id: childId, weekday,
      item_index: itemIndex, drink, location, active: true,
    }, { onConflict: "child_id,weekday" })
    .select().single();
  if (error) throw error;
  return data;
}
export async function deleteRepeatOrder(id) {
  const { error } = await supabase.from("repeat_orders").delete().eq("id", id);
  if (error) throw error;
}
export async function syncMyRepeatOrders() {
  const { data, error } = await supabase.rpc("sync_my_repeat_orders");
  if (error) throw error;
  return data;
}
