// src/context/AppContext.jsx
// Replaces all the local useState({...initialState}) in App.jsx.
// Wrap your <App /> with <AppProvider> and use useApp() anywhere.
//
// This context normalizes Supabase's snake_case rows into camelCase
// shapes the UI expects, and exposes action helpers so components
// never need to import from ../lib/supabase directly.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  supabase,
  signIn as sbSignIn,
  signOut as sbSignOut,
  registerParent as sbRegisterParent,
  getMyProfile,
  getAllParents,
  getMyChildren,
  getLocations,
  getMenuRange,
  getOrders,
  getBlockedDays,
  getNotifications,
  saveMenuDay,
  applyMenuRotation as sbApplyMenuRotation,
  notifyMenuChange,
  placeOrder as sbPlaceOrder,
  cancelOrder as sbCancelOrder,
  addBlockedDay as sbAddBlockedDay,
  addBlockedDayRange as sbAddBlockedDayRange,
  removeBlockedDay as sbRemoveBlockedDay,
  removeBlockedDays as sbRemoveBlockedDays,
  addLocation as sbAddLocation,
  renameLocation as sbRenameLocation,
  deleteLocation as sbDeleteLocation,
  getDrinks,
  addDrink as sbAddDrink,
  updateDrink as sbUpdateDrink,
  deleteDrink as sbDeleteDrink,
  getMyRepeatOrders,
  upsertRepeatOrder as sbUpsertRepeatOrder,
  deleteRepeatOrder as sbDeleteRepeatOrder,
  syncMyRepeatOrders as sbSyncMyRepeatOrders,
  upsertChild as sbUpsertChild,
  deleteChild as sbDeleteChild,
  updateProfile as sbUpdateProfile,
  deleteParent as sbDeleteParent,
  sendPasswordReset as sbSendPasswordReset,
} from "../lib/supabase";

// ── Normalizers (snake_case DB rows → camelCase UI shape) ──────
function normalizeChild(c) {
  if (!c) return c;
  return {
    id: c.id,
    parent_id: c.parent_id,
    name: c.name,
    grade: c.grade,
    dietary: {
      selected: c.dietary_selected || [],
      otherDetails: c.dietary_other || "",
    },
  };
}

function normalizeProfile(p) {
  if (!p) return p;
  return {
    ...p,
    children: (p.children || []).map(normalizeChild),
  };
}

function normalizeOrder(o) {
  if (!o) return o;
  return {
    id: o.id,
    parentId: o.parent_id,
    childId: o.child_id,
    menuDayId: o.menu_day_id,
    menuItemId: o.menu_item_id,
    date: o.order_date,
    mainItem: o.item_name,
    price: Number(o.item_price) || 0,
    drink: o.drink,
    location: o.location,
    childName: o.child_name,
    childGrade: o.child_grade,
    parentName: o.parent_name,
    dietary: {
      selected: o.dietary_selected || [],
      otherDetails: o.dietary_other || "",
    },
  };
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession]       = useState(null);
  const [profile, setProfile]       = useState(null);
  const [loading, setLoading]       = useState(true);

  const [menu, setMenu]             = useState({});
  const [orders, setOrders]         = useState([]);
  const [parents, setParents]       = useState([]);
  const [myChildren, setMyChildren] = useState([]);
  const [blockedDays, setBlockedDays] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [locations, setLocations]   = useState([]);
  const [drinks, setDrinks]         = useState([]);
  const [repeatOrders, setRepeatOrders] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    loadAll();
  }, [session]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const profRaw = await getMyProfile();
      const prof = normalizeProfile(profRaw);
      setProfile(prof);

      const from = offsetDate(-28);
      const to   = offsetDate(365);

      const [menuData, blockedData, notifData, locData, drinkData] = await Promise.all([
        getMenuRange(from, to),
        getBlockedDays(),
        prof.role !== "parent" ? getNotifications() : Promise.resolve([]),
        getLocations(),
        getDrinks(),
      ]);

      setMenu(menuData);
      setBlockedDays(blockedData);
      setNotifications(notifData);
      setLocations(locData);
      setDrinks(drinkData);

      if (prof.role === "parent") {
        const [ordersData, childrenData, repeatData] = await Promise.all([
          getOrders({ parentId: prof.id }),
          getMyChildren(prof.id),
          getMyRepeatOrders(prof.id),
        ]);
        setOrders(ordersData.map(normalizeOrder));
        setMyChildren(childrenData.map(normalizeChild));
        setRepeatOrders(repeatData);
      } else if (prof.role === "schooladmin") {
        const ordersData = await getOrders({ location: prof.location });
        setOrders(ordersData.map(normalizeOrder));
      } else if (prof.role === "superadmin") {
        const [ordersData, parentsData] = await Promise.all([
          getOrders(),
          getAllParents(),
        ]);
        setOrders(ordersData.map(normalizeOrder));
        setParents(parentsData.map(normalizeProfile));
      }
    } catch (err) {
      console.error("loadAll error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;

    const orderSub = supabase
      .channel("orders-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refreshOrders())
      .subscribe();

    const menuSub = supabase
      .channel("menu-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_days" }, () => refreshMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => refreshMenu())
      .subscribe();

    const blockedSub = supabase
      .channel("blocked-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_days" }, () => {
        getBlockedDays().then(setBlockedDays);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(orderSub);
      supabase.removeChannel(menuSub);
      supabase.removeChannel(blockedSub);
    };
  }, [session, profile]);

  const refreshMenu = useCallback(async () => {
    const from = offsetDate(-28);
    const to   = offsetDate(365);
    const data = await getMenuRange(from, to);
    setMenu(data);
  }, []);

  const refreshOrders = useCallback(async () => {
    if (!profile) return;
    let data;
    if (profile.role === "parent")            data = await getOrders({ parentId: profile.id });
    else if (profile.role === "schooladmin")  data = await getOrders({ location: profile.location });
    else                                      data = await getOrders();
    setOrders(data.map(normalizeOrder));
  }, [profile]);

  const refreshParents = useCallback(async () => {
    if (profile?.role !== "superadmin") return;
    const data = await getAllParents();
    setParents(data.map(normalizeProfile));
  }, [profile]);

  const refreshChildren = useCallback(async () => {
    if (!profile || profile.role !== "parent") return;
    const data = await getMyChildren(profile.id);
    setMyChildren(data.map(normalizeChild));
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    const data = await getMyProfile();
    setProfile(normalizeProfile(data));
  }, []);

  const refreshLocations = useCallback(async () => {
    setLocations(await getLocations());
  }, []);

  const refreshDrinks = useCallback(async () => {
    setDrinks(await getDrinks());
  }, []);

  const refreshRepeatOrders = useCallback(async () => {
    if (!profile || profile.role !== "parent") return;
    setRepeatOrders(await getMyRepeatOrders(profile.id));
  }, [profile]);

  const refreshNotifications = useCallback(async () => {
    setNotifications(await getNotifications());
  }, []);

  const actions = {
    signIn: async (email, password) => { await sbSignIn(email, password); },
    signOut: async () => { await sbSignOut(); },
    registerParent: async (args) => { await sbRegisterParent(args); },

    saveMenu: async (date, items) => {
      await saveMenuDay(date, items);
      try { await notifyMenuChange(date, items); } catch (e) { console.warn("notify failed:", e); }
      await refreshMenu();
      await refreshNotifications();
    },
    applyMenuRotation: async (sourceStart, targetStart, weeksCount) => {
      const written = await sbApplyMenuRotation(sourceStart, targetStart, weeksCount);
      await refreshMenu();
      return written;
    },

    placeOrder: async (args) => { await sbPlaceOrder(args); await refreshOrders(); },
    cancelOrder: async (id) => { await sbCancelOrder(id); await refreshOrders(); },

    addBlockedDay: async (args) => {
      await sbAddBlockedDay(args);
      setBlockedDays(await getBlockedDays());
    },
    addBlockedDayRange: async (args) => {
      const rows = await sbAddBlockedDayRange(args);
      setBlockedDays(await getBlockedDays());
      return rows.length;
    },
    removeBlockedDay: async (id) => {
      await sbRemoveBlockedDay(id);
      setBlockedDays(await getBlockedDays());
    },
    removeBlockedDays: async (ids) => {
      await sbRemoveBlockedDays(ids);
      setBlockedDays(await getBlockedDays());
    },

    addLocation: async (name) => { await sbAddLocation(name); await refreshLocations(); },
    renameLocation: async (oldName, newName) => {
      await sbRenameLocation(oldName, newName);
      await refreshLocations();
      await refreshParents();
    },
    deleteLocation: async (name) => { await sbDeleteLocation(name); await refreshLocations(); },

    addDrink: async (args) => { await sbAddDrink(args); await refreshDrinks(); },
    updateDrink: async (id, updates) => { await sbUpdateDrink(id, updates); await refreshDrinks(); },
    deleteDrink: async (id) => { await sbDeleteDrink(id); await refreshDrinks(); },

    upsertChild: async (child) => {
      const row = {
        ...(child.id ? { id: child.id } : {}),
        parent_id: child.parent_id || profile.id,
        name: child.name,
        grade: child.grade,
        dietary_selected: child.dietary?.selected || [],
        dietary_other:    child.dietary?.otherDetails || "",
      };
      await sbUpsertChild(row);
      await refreshChildren();
      await refreshParents();
    },
    deleteChild: async (id) => {
      await sbDeleteChild(id);
      await refreshChildren();
      await refreshParents();
    },

    upsertRepeatOrder: async (args) => {
      await sbUpsertRepeatOrder(args);
      await refreshRepeatOrders();
      await refreshOrders();
    },
    deleteRepeatOrder: async (id) => {
      await sbDeleteRepeatOrder(id);
      await refreshRepeatOrders();
      await refreshOrders();
    },
    syncMyRepeatOrders: async () => {
      const n = await sbSyncMyRepeatOrders();
      await refreshOrders();
      return n;
    },

    updateProfile: async (id, updates) => {
      const row = { ...updates };
      delete row.email;
      delete row.children;
      delete row.password;
      delete row.repeatDays;
      await sbUpdateProfile(id, row);
      if (id === profile?.id) await refreshProfile();
      await refreshParents();
    },
    deleteParent: async (id) => {
      await sbDeleteParent(id);
      await refreshParents();
    },
    sendPasswordReset: async (email) => {
      await sbSendPasswordReset(email);
    },
  };

  const value = {
    session, profile, loading,
    menu, orders, parents,
    children: myChildren,
    blockedDays, notifications, locations, drinks, repeatOrders,
    refreshMenu, refreshOrders, refreshParents, refreshChildren,
    refreshProfile, refreshLocations, refreshDrinks, refreshRepeatOrders, refreshNotifications,
    reloadAll: loadAll,
    actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
