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
    // Denormalized fields from order_details view (may be undefined for raw rows)
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

  // Shared data
  // Note: `myChildren` (not `children`) because `children` here would shadow
  // the React prop `children` passed into <AppProvider>{children}</AppProvider>.
  const [menu, setMenu]             = useState({});
  const [orders, setOrders]         = useState([]);
  const [parents, setParents]       = useState([]);
  const [myChildren, setMyChildren] = useState([]);   // current parent's children
  const [blockedDays, setBlockedDays] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [locations, setLocations]   = useState([]);   // ['Episcopal...', 'Holly...']
  const [drinks, setDrinks]         = useState([]);   // [{id, name, emoji}, ...]
  const [repeatOrders, setRepeatOrders] = useState([]); // current parent's active repeats

  // ── Auth listener ───────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load profile + data when session changes ────────────────
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

      // Date range: 4 weeks back, ~1 year forward.
      // Wide enough to show full 2-week rotations replicated for many months.
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

  // ── Real-time subscriptions ────────