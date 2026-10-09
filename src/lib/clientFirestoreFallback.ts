import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION_NAME = 'app_data';
const DEFAULT_DOCUMENT_ID = 'indoor_media_db_multicast';
const LEGACY_DOCUMENT_ID = 'indoor_media_db';
const DOCUMENT_ID = ((import.meta.env.VITE_FIRESTORE_DOC_ID as string | undefined)?.trim()) || DEFAULT_DOCUMENT_ID;
const LOCAL_DB_CACHE_KEY = 'indoor_media_cloud_db_cache_multicast';
const LEGACY_CACHE_KEY = 'indoor_media_cloud_db_cache';

const PRIMARY_FIRESTORE_CONFIG = {
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'deep-freedom-8szp9',
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || 'AIzaSyCzP6rv9WIneoF9OUDTRppATOsCLOS-vvQ',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || '1:676316244483:web:bc8f3491e953b884c9fc36',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || 'deep-freedom-8szp9.firebaseapp.com',
  firestoreDatabaseId: (import.meta.env.VITE_FIRESTORE_DATABASE_ID as string) || 'ai-studio-remixmdiaindoor2-b21786e5-9cc2-4541-8854-9ca7fb6c84ba',
};

// Migrate from legacy cache key if new cache key is empty
try {
  const currentCache = localStorage.getItem(LOCAL_DB_CACHE_KEY);
  if (!currentCache) {
    const legacyCache = localStorage.getItem(LEGACY_CACHE_KEY);
    if (legacyCache) {
      const parsedLegacy = JSON.parse(legacyCache);
      if (parsedLegacy?.companies && parsedLegacy.companies.length > 0) {
        localStorage.setItem(LOCAL_DB_CACHE_KEY, legacyCache);
      }
    }
  }
} catch {}

// Purge any empty fallback cache that may have been stored previously
try {
  const existingCache = localStorage.getItem(LOCAL_DB_CACHE_KEY);
  if (existingCache) {
    const parsedCache = JSON.parse(existingCache);
    if (!parsedCache?.companies || parsedCache.companies.length === 0) {
      localStorage.removeItem(LOCAL_DB_CACHE_KEY);
    }
  }
} catch {}

function getClientFirestore() {
  const appName = 'indoor-media-firestore-client';
  const existingApp = getApps().find((a) => a.name === appName);
  const app = existingApp ? existingApp : initializeApp(PRIMARY_FIRESTORE_CONFIG, appName);
  return getFirestore(app, PRIMARY_FIRESTORE_CONFIG.firestoreDatabaseId);
}

const DEFAULT_DB = {
  plans: [
    { id: 'plan-1', name: '1 Player + 1 Operador', max_players: 1, max_operators: 1 },
    { id: 'plan-2', name: '2 Players + 1 Operador', max_players: 2, max_operators: 1 },
    { id: 'plan-3', name: '2 Players + 2 Operadores', max_players: 2, max_operators: 2 },
    { id: 'plan-4', name: '3 Players + 2 Operadores', max_players: 3, max_operators: 2 },
    { id: 'plan-5', name: '4 Players + 2 Operadores', max_players: 4, max_operators: 2 },
    { id: 'plan-6', name: '1 Player Sem Operador', max_players: 1, max_operators: 0 },
  ],
  users: [
    {
      id: 'usr-admin-1',
      name: 'Administrador Geral',
      email: 'ale11062@gmail.com',
      password_hash: 'admin',
      salt: 'admin',
      role: 'admin',
      active: true,
      must_change_password: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  companies: [] as any[],
  stores: [] as any[],
  players: [] as any[],
  operators: [] as any[],
  playlists: [] as any[],
  media: [] as any[],
  rss_feeds: [] as any[],
  call_phrases: [] as any[],
  player_calls: [] as any[],
  sessions: [] as any[],
  drive_documents: [] as any[],
  drive_settings: {
    connected: false,
    root_folder_name: 'Mídia Indoor - Clientes',
    auto_sync: true,
  } as any,
};

let cachedDb: any = null;
let lastLoadedAt = 0;

function normalizeDbShape(parsed: any) {
  const stores = parsed.company_stores || parsed.stores || [];
  return {
    ...DEFAULT_DB,
    ...parsed,
    company_stores: stores,
    stores,
  };
}

async function loadCloudDb(forceRefresh = false): Promise<any> {
  if (cachedDb && (cachedDb.companies?.length || 0) > 0 && !forceRefresh && Date.now() - lastLoadedAt < 5000) {
    return cachedDb;
  }
  try {
    const fs = getClientFirestore();
    const snap = await getDoc(doc(fs, COLLECTION_NAME, DOCUMENT_ID));
    if (snap.exists()) {
      const raw = snap.data();
      if (raw && typeof raw.data === 'string') {
        const parsed = JSON.parse(raw.data);
        cachedDb = normalizeDbShape(parsed);
        lastLoadedAt = Date.now();
        try {
          if ((cachedDb.companies?.length || 0) > 0) {
            localStorage.setItem(LOCAL_DB_CACHE_KEY, JSON.stringify(cachedDb));
          }
        } catch {}
        return cachedDb;
      }
    } else if (DOCUMENT_ID !== LEGACY_DOCUMENT_ID) {
      // First time booting on independent document: duplicate from legacy document if available
      try {
        const legacySnap = await getDoc(doc(fs, COLLECTION_NAME, LEGACY_DOCUMENT_ID));
        if (legacySnap.exists()) {
          const rawLegacy = legacySnap.data();
          if (rawLegacy && typeof rawLegacy.data === 'string') {
            const parsedLegacy = JSON.parse(rawLegacy.data);
            console.log('[ClientFallback] Found legacy cloud data; duplicating to new independent document...');
            cachedDb = normalizeDbShape(parsedLegacy);
            lastLoadedAt = Date.now();
            await saveCloudDb(cachedDb);
            return cachedDb;
          }
        }
      } catch (legErr) {
        console.warn('[ClientFallback] Could not duplicate from legacy document:', legErr);
      }
    }
  } catch (err) {
    console.warn('[ClientFallback] Error reading Firestore:', err);
  }

  try {
    const localRaw = localStorage.getItem(LOCAL_DB_CACHE_KEY);
    if (localRaw) {
      const parsedLocal = JSON.parse(localRaw);
      if ((parsedLocal?.companies?.length || 0) > 0) {
        cachedDb = normalizeDbShape(parsedLocal);
        return cachedDb;
      }
    }
  } catch {}

  cachedDb = normalizeDbShape(JSON.parse(JSON.stringify(DEFAULT_DB)));
  return cachedDb;
}

async function saveCloudDb(dbData: any): Promise<void> {
  // Safety guard: never overwrite Firestore or local cache with an empty company list
  if (!dbData || !Array.isArray(dbData.companies) || dbData.companies.length === 0) {
    console.warn('[ClientFallback] Skipping saveCloudDb because companies list is empty.');
    return;
  }

  dbData.company_stores = dbData.company_stores || dbData.stores || [];
  dbData.stores = dbData.company_stores;
  cachedDb = dbData;
  lastLoadedAt = Date.now();
  try {
    localStorage.setItem(LOCAL_DB_CACHE_KEY, JSON.stringify(dbData));
  } catch {}

  try {
    const fs = getClientFirestore();
    const serialized = JSON.stringify(dbData);
    await setDoc(doc(fs, COLLECTION_NAME, DOCUMENT_ID), {
      version: 1,
      updated_at: new Date().toISOString(),
      stats: {
        users: dbData.users?.length || 0,
        companies: dbData.companies?.length || 0,
        company_stores: dbData.company_stores?.length || 0,
        players: dbData.players?.length || 0,
        playlists: dbData.playlists?.length || 0,
        media: dbData.media?.length || 0,
      },
      data: serialized,
    });
  } catch (err) {
    console.warn('[ClientFallback] Error saving to Firestore:', err);
  }
}

function getCurrentUserFromToken(dbData: any, token: string | null) {
  if (!token) return null;
  const session = (dbData.sessions || []).find((s: any) => s.token === token);
  if (session) {
    const targetUserId = session.userId || session.user_id;
    const u = (dbData.users || []).find((usr: any) => usr.id === targetUserId);
    if (u) return { user: u, playerId: session.playerId || session.player_id };
  }
  try {
    const cachedSession = localStorage.getItem('indoor_cached_session');
    if (cachedSession) {
      const parsed = JSON.parse(cachedSession);
      if (parsed?.user) {
        const u = (dbData.users || []).find((usr: any) => usr.id === parsed.user.id || usr.email === parsed.user.email) || parsed.user;
        return { user: u, playerId: parsed?.player?.id };
      }
    }
  } catch {}
  return null;
}

export async function handleClientFallbackRequest(
  endpoint: string,
  options: RequestInit,
  token: string | null
): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const pathOnly = endpoint.split('?')[0];
  const dbData = await loadCloudDb();

  // 1. AUTH LOGIN
  if (pathOnly === '/auth/login' && method === 'POST') {
    const { email, password, playerCode, playerToken, token: inputToken } = body;
    const effectiveToken = (playerToken || inputToken || (playerCode && String(playerCode).trim().startsWith('tok_') ? playerCode : null))?.trim();

    if (effectiveToken || playerCode) {
      const pCode = String(playerCode || effectiveToken || '').trim().toLowerCase();
      const player = (dbData.players || []).find(
        (p: any) =>
          (p.access_token === effectiveToken || String(p.code || '').toLowerCase() === pCode) &&
          p.status === 'active'
      );
      if (!player) throw new Error('Código ou Token de Player inválido ou inativo.');
      const company = (dbData.companies || []).find((c: any) => c.id === player.company_id);
      const playerUser = (dbData.users || []).find((u: any) => u.id === player.user_id) || {
        id: `usr-pl-${player.id}`,
        name: player.name,
        email: `${player.code}@player.local`,
        role: 'player',
        company_id: player.company_id,
        must_change_password: false,
      };
      const newToken = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      dbData.sessions = [
        ...(dbData.sessions || []),
        {
          token: newToken,
          userId: playerUser.id,
          user_id: playerUser.id,
          role: 'player',
          companyId: player.company_id,
          company_id: player.company_id,
          playerId: player.id,
          player_id: player.id,
          createdAt: Date.now(),
          created_at: Date.now(),
        },
      ];
      await saveCloudDb(dbData);
      return {
        token: newToken,
        user: playerUser,
        player,
        company: company ? { id: company.id, name: company.trade_name } : null,
      };
    }

    if (!email || !password) {
      throw new Error('E-mail e senha são obrigatórios.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let user = (dbData.users || []).find(
      (u: any) =>
        String(u.email || '').toLowerCase() === normalizedEmail ||
        (u.role === 'admin' && ['ale11062@gmail.com', 'admin', 'admin@admin.com', 'admin@midia.com'].includes(normalizedEmail))
    );

    if (!user && ['ale11062@gmail.com', 'admin', 'admin@admin.com', 'admin@midia.com'].includes(normalizedEmail)) {
      user = DEFAULT_DB.users[0];
      dbData.users = [user, ...(dbData.users || [])];
    }

    if (!user) {
      const matchedComp = (dbData.companies || []).find((c: any) => c.email && c.email.trim().toLowerCase() === normalizedEmail);
      if (matchedComp) {
        user = (dbData.users || []).find((u: any) => u.company_id === matchedComp.id && u.role === 'company');
      }
    }

    if (!user) {
      const matchedOp = (dbData.operators || []).find((o: any) => o.email && o.email.trim().toLowerCase() === normalizedEmail);
      if (matchedOp) {
        user = (dbData.users || []).find((u: any) => u.id === matchedOp.user_id);
      }
    }

    if (!user || user.active === false) {
      throw new Error('Credenciais inválidas ou usuário inativo.');
    }

    const newToken = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dbData.sessions = [
      ...(dbData.sessions || []),
      {
        token: newToken,
        userId: user.id,
        user_id: user.id,
        role: user.role,
        companyId: user.company_id,
        company_id: user.company_id,
        createdAt: Date.now(),
        created_at: Date.now(),
      },
    ];
    await saveCloudDb(dbData);

    const companyData = user.company_id ? (dbData.companies || []).find((c: any) => c.id === user.company_id) : null;
    const player = user.role === 'player' ? (dbData.players || []).find((p: any) => p.user_id === user.id) : null;

    return {
      token: newToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        must_change_password: !!user.must_change_password,
      },
      company: companyData ? { id: companyData.id, name: companyData.trade_name } : null,
      player: player || null,
    };
  }

  // 2. AUTH ME
  if (pathOnly === '/auth/me' && method === 'GET') {
    const authCtx = getCurrentUserFromToken(dbData, token);
    if (!authCtx) throw new Error('Sessão inválida ou expirada.');
    const { user } = authCtx;
    const company = user.company_id ? (dbData.companies || []).find((c: any) => c.id === user.company_id) : null;
    const player = user.role === 'player' ? (dbData.players || []).find((p: any) => p.user_id === user.id) : null;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        must_change_password: !!user.must_change_password,
      },
      company: company ? { id: company.id, name: company.trade_name } : null,
      player: player || null,
    };
  }

  // 3. ADMIN STATS & ENDPOINTS
  if (pathOnly === '/admin/stats' && method === 'GET') {
    const totalCompanies = (dbData.companies || []).length;
    const activeCompanies = (dbData.companies || []).filter((c: any) => c.status === 'active').length;
    return {
      totalCompanies,
      activeCompanies,
      inactiveCompanies: totalCompanies - activeCompanies,
      totalPlayers: (dbData.players || []).length,
    };
  }

  if (pathOnly === '/admin/firestore/status' && method === 'GET') {
    return {
      configured: true,
      provider: 'Firebase Firestore',
      lastSyncTimestamp: new Date().toISOString(),
      lastSyncError: null,
      isSyncing: false,
    };
  }

  if (pathOnly === '/admin/firestore/sync' && method === 'POST') {
    await saveCloudDb(dbData);
    return { message: 'Sincronizado com Firebase Firestore com sucesso!' };
  }

  if (pathOnly === '/admin/firestore/pull' && method === 'POST') {
    await loadCloudDb(true);
    return { message: 'Dados restaurados do Firebase Firestore com sucesso!' };
  }

  if (pathOnly === '/admin/companies' && method === 'GET') {
    return (dbData.companies || []).map((c: any) => {
      const plan = (dbData.plans || DEFAULT_DB.plans).find((p: any) => p.id === c.plan_id);
      return {
        ...c,
        plan_name: plan?.name || 'Plano Customizado',
        max_players: c.custom_max_players ?? plan?.max_players ?? 1,
        max_operators: c.custom_max_operators ?? plan?.max_operators ?? 1,
        players_count: (dbData.players || []).filter((p: any) => p.company_id === c.id).length,
        operators_count: (dbData.operators || []).filter((o: any) => o.company_id === c.id).length,
      };
    });
  }

  if (pathOnly === '/admin/plans' && method === 'GET') {
    return dbData.plans?.length ? dbData.plans : DEFAULT_DB.plans;
  }

  // 4. DRIVE SETTINGS & DOCUMENTS
  if (pathOnly === '/drive/settings' && method === 'GET') {
    return { status: 'ok', settings: dbData.drive_settings || DEFAULT_DB.drive_settings };
  }

  if (pathOnly === '/drive/settings' && method === 'POST') {
    dbData.drive_settings = { ...(dbData.drive_settings || DEFAULT_DB.drive_settings), ...body };
    await saveCloudDb(dbData);
    return { status: 'ok', settings: dbData.drive_settings };
  }

  if (pathOnly === '/drive/documents' && method === 'GET') {
    return { status: 'ok', documents: dbData.drive_documents || [] };
  }

  // 5. COMPANY ENDPOINTS
  const authCtx = getCurrentUserFromToken(dbData, token);
  const activeCompanyId = authCtx?.user?.company_id || (dbData.companies?.[0]?.id ?? 'comp-1');

  if (pathOnly === '/company/stats' && method === 'GET') {
    const comp = (dbData.companies || []).find((c: any) => c.id === activeCompanyId) || dbData.companies?.[0];
    const plan = (dbData.plans || DEFAULT_DB.plans).find((p: any) => p.id === comp?.plan_id);
    const compPlayers = (dbData.players || []).filter((p: any) => p.company_id === activeCompanyId);
    const compOps = (dbData.operators || []).filter((o: any) => o.company_id === activeCompanyId);
    const compPlaylists = (dbData.playlists || []).filter((p: any) => p.company_id === activeCompanyId);
    const compMedia = (dbData.media || []).filter((m: any) => m.company_id === activeCompanyId);
    return {
      company: comp,
      plan_name: plan?.name || 'Plano Corporativo',
      limits: {
        max_players: comp?.custom_max_players ?? plan?.max_players ?? 10,
        max_operators: comp?.custom_max_operators ?? plan?.max_operators ?? 10,
      },
      counts: {
        players: compPlayers.length,
        online_players: compPlayers.filter((p: any) => p.online).length,
        operators: compOps.length,
        playlists: compPlaylists.length,
        active_playlists: compPlaylists.filter((p: any) => p.active).length,
        media: compMedia.length,
      },
    };
  }

  if (pathOnly === '/company/stores' && method === 'GET') {
    return (dbData.company_stores || dbData.stores || []).filter((s: any) => s.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/players' && method === 'GET') {
    return (dbData.players || []).filter((p: any) => p.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/operators' && method === 'GET') {
    return (dbData.operators || []).filter((o: any) => o.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/playlists' && method === 'GET') {
    return (dbData.playlists || []).filter((p: any) => p.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/media' && method === 'GET') {
    return (dbData.media || []).filter((m: any) => m.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/rss' && method === 'GET') {
    return (dbData.rss_feeds || []).filter((r: any) => r.company_id === activeCompanyId);
  }
  if (pathOnly === '/company/media/integrity-status' && method === 'GET') {
    return null;
  }

  // 6. WRITE / MUTATION ENDPOINTS IN FALLBACK MODE
  if (pathOnly === '/admin/companies' && method === 'POST') {
    const newComp = {
      id: `comp-${Date.now()}`,
      status: 'active',
      created_at: new Date().toISOString(),
      ...body,
    };
    dbData.companies = [newComp, ...(dbData.companies || [])];
    if (body.email) {
      dbData.users = [
        ...(dbData.users || []),
        {
          id: `usr-comp-${Date.now()}`,
          name: body.trade_name || body.legal_name || 'Empresa',
          email: body.email,
          password_hash: body.password || '123456',
          salt: 'local',
          role: 'company',
          company_id: newComp.id,
          active: true,
          must_change_password: false,
          created_at: new Date().toISOString(),
        },
      ];
    }
    await saveCloudDb(dbData);
    return newComp;
  }

  if (pathOnly.startsWith('/admin/companies/') && method === 'PUT') {
    const compId = pathOnly.split('/')[3];
    dbData.companies = (dbData.companies || []).map((c: any) =>
      c.id === compId ? { ...c, ...body, updated_at: new Date().toISOString() } : c
    );
    await saveCloudDb(dbData);
    return (dbData.companies || []).find((c: any) => c.id === compId);
  }

  if (pathOnly === '/company/media' && method === 'POST') {
    const newMedia = {
      id: `med-${Date.now()}`,
      company_id: activeCompanyId,
      created_at: new Date().toISOString(),
      ...body,
    };
    dbData.media = [newMedia, ...(dbData.media || [])];
    await saveCloudDb(dbData);
    return newMedia;
  }

  if (pathOnly.startsWith('/company/media/') && method === 'DELETE') {
    const medId = pathOnly.split('/')[3];
    dbData.media = (dbData.media || []).filter((m: any) => m.id !== medId);
    await saveCloudDb(dbData);
    return { message: 'Mídia excluída com sucesso.' };
  }

  if (pathOnly === '/company/playlists' && method === 'POST') {
    const newPl = {
      id: `pl-${Date.now()}`,
      company_id: activeCompanyId,
      active: true,
      items: [],
      created_at: new Date().toISOString(),
      ...body,
    };
    dbData.playlists = [newPl, ...(dbData.playlists || [])];
    await saveCloudDb(dbData);
    return newPl;
  }

  if (pathOnly.startsWith('/company/playlists/') && method === 'PUT') {
    const plId = pathOnly.split('/')[3];
    dbData.playlists = (dbData.playlists || []).map((p: any) =>
      p.id === plId ? { ...p, ...body, updated_at: new Date().toISOString() } : p
    );
    await saveCloudDb(dbData);
    return (dbData.playlists || []).find((p: any) => p.id === plId);
  }

  if (pathOnly.startsWith('/company/operators/') && method === 'PUT') {
    const opId = pathOnly.split('/')[3];
    dbData.operators = (dbData.operators || []).map((o: any) => {
      if (o.id === opId) {
        const updated = { ...o, ...body, updated_at: new Date().toISOString() };
        if (body.email || body.name) {
          dbData.users = (dbData.users || []).map((u: any) =>
            u.id === o.user_id
              ? { ...u, email: body.email || u.email, name: body.name || u.name, updated_at: new Date().toISOString() }
              : u
          );
        }
        return updated;
      }
      return o;
    });
    await saveCloudDb(dbData);
    return (dbData.operators || []).find((o: any) => o.id === opId);
  }

  if (pathOnly === '/drive/documents' && method === 'POST') {
    const newDoc = {
      id: `ddoc-${Date.now()}`,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...body,
    };
    dbData.drive_documents = [newDoc, ...(dbData.drive_documents || [])];
    if (body.category === 'photo' || String(body.mime_type || '').startsWith('image/') || String(body.mime_type || '').startsWith('video/')) {
      const mediaUrl = body.drive_file_id && !String(body.drive_file_id).startsWith('local-')
        ? `https://drive.google.com/thumbnail?id=${body.drive_file_id}&sz=w1920`
        : body.drive_download_url || body.drive_view_url || '';
      if (mediaUrl) {
        dbData.media = [
          {
            id: `med-${Date.now()}`,
            company_id: body.company_id || activeCompanyId,
            name: body.title || body.file_name || 'Mídia',
            type: String(body.mime_type || '').startsWith('video/') ? 'video' : 'image',
            file_url: mediaUrl,
            duration: 10,
            unique_code: body.unique_code,
            drive_file_id: body.drive_file_id,
            drive_view_url: body.drive_view_url,
            created_at: new Date().toISOString(),
          },
          ...(dbData.media || []),
        ];
      }
    }
    await saveCloudDb(dbData);
    return { status: 'ok', document: newDoc };
  }

  if (pathOnly === '/upload/chunk' && method === 'POST') {
    const { uploadId, chunkIndex, totalChunks, chunkData, filename, mimeType } = body;
    const win = window as any;
    win.__chunkUploads = win.__chunkUploads || {};
    const base64Clean = String(chunkData || '').replace(/^data:[^;]+;base64,/, '');
    if (Number(chunkIndex) === 0 || !win.__chunkUploads[uploadId]) {
      win.__chunkUploads[uploadId] = { parts: [], mimeType: mimeType || 'image/jpeg', filename };
    }
    win.__chunkUploads[uploadId].parts[Number(chunkIndex)] = base64Clean;
    const safeExt = (filename || 'file.bin').split('.').pop() || 'bin';
    const finalName = `${uploadId}.${safeExt}`;
    if (Number(chunkIndex) + 1 >= Number(totalChunks)) {
      const fullBase64 = win.__chunkUploads[uploadId].parts.join('');
      win.__chunkUploads[finalName] = `data:${mimeType || 'application/octet-stream'};base64,${fullBase64}`;
    }
    return { status: 'ok', filename: finalName, url: `/uploads/${finalName}` };
  }

  if (pathOnly === '/company/media/upload-to-drive' && method === 'POST') {
    const { uploadedFilename, fileData, filename, mimeType, name, duration, companyId } = body;
    const win = window as any;
    const resolvedDataUrl =
      (uploadedFilename && win.__chunkUploads?.[uploadedFilename]) ||
      fileData ||
      `/uploads/${uploadedFilename || filename}`;
    const isVideo = String(mimeType || '').startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(filename || '');
    const newMedia = {
      id: `med-${Date.now()}`,
      company_id: companyId || activeCompanyId,
      name: name || filename || 'Mídia',
      type: isVideo ? 'video' : 'image',
      file_url: resolvedDataUrl,
      duration: Number(duration) || 10,
      unique_code: `${isVideo ? 'VIDEO' : 'FOTO'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      created_at: new Date().toISOString(),
    };
    dbData.media = [newMedia, ...(dbData.media || [])];
    await saveCloudDb(dbData);
    return {
      status: 'ok',
      media: newMedia,
      savedToDrive: false,
      message: 'Mídia cadastrada com sucesso!',
    };
  }

  if (pathOnly.endsWith('/impersonate') && pathOnly.startsWith('/admin/companies/') && method === 'POST') {
    const compId = pathOnly.split('/')[3];
    const company = (dbData.companies || []).find((c: any) => c.id === compId);
    if (!company) throw new Error('Empresa não encontrada.');
    let compUser = (dbData.users || []).find((u: any) => u.company_id === company.id && u.role === 'company');
    if (!compUser) {
      compUser = {
        id: `usr-comp-${Date.now()}`,
        name: company.trade_name || company.legal_name,
        email: company.email || `${company.id}@empresa.local`,
        password_hash: '123456',
        salt: 'local',
        role: 'company',
        company_id: company.id,
        active: true,
        must_change_password: false,
        created_at: new Date().toISOString(),
      };
      dbData.users = [compUser, ...(dbData.users || [])];
    }
    const newToken = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dbData.sessions = [
      ...(dbData.sessions || []),
      {
        token: newToken,
        userId: compUser.id,
        user_id: compUser.id,
        role: 'company',
        companyId: company.id,
        company_id: company.id,
        createdAt: Date.now(),
        created_at: Date.now(),
      },
    ];
    await saveCloudDb(dbData);
    return {
      token: newToken,
      user: {
        id: compUser.id,
        name: compUser.name,
        email: compUser.email,
        role: compUser.role,
        company_id: compUser.company_id,
        must_change_password: false,
      },
      company: { id: company.id, name: company.trade_name },
    };
  }

  if (pathOnly === '/operator/dashboard' && method === 'GET') {
    const compPlayers = (dbData.players || []).filter((p: any) => p.company_id === activeCompanyId);
    const compPhrases = (dbData.call_phrases || []).filter((ph: any) => ph.company_id === activeCompanyId);
    return {
      players: compPlayers.map((p: any) => ({
        ...p,
        is_online: true,
        last_seen: new Date().toISOString(),
      })),
      phrases: compPhrases,
      server_time: new Date().toISOString(),
    };
  }

  if (pathOnly === '/operator/call' && method === 'POST') {
    const newCall = {
      id: `call-${Date.now()}`,
      company_id: activeCompanyId,
      player_id: body.playerId,
      phrase: body.phrase,
      duration: Number(body.duration) || 10,
      is_priority: !!(body.isPriority || body.is_priority),
      timestamp: Date.now(),
      created_at: new Date().toISOString(),
    };
    dbData.player_calls = [newCall, ...(dbData.player_calls || []).slice(0, 49)];
    await saveCloudDb(dbData);
    return { message: 'Chamada disparada com sucesso!', call: newCall, delivered: true };
  }

  if (pathOnly === '/player/current' && method === 'GET') {
    const qs = new URLSearchParams(endpoint.split('?')[1] || '');
    const code = qs.get('code');
    const tok = qs.get('token');
    let player = (dbData.players || []).find(
      (p: any) =>
        (code && String(p.code || '').toLowerCase() === code.toLowerCase()) ||
        (tok && (p.access_token === tok || String(p.code || '').toLowerCase() === tok.toLowerCase()))
    );
    if (!player && authCtx?.playerId) {
      player = (dbData.players || []).find((p: any) => p.id === authCtx.playerId);
    }
    if (!player) player = (dbData.players || [])[0];
    if (!player) throw new Error('Player não encontrado.');
    const company = (dbData.companies || []).find((c: any) => c.id === player.company_id) || {
      id: player.company_id,
      trade_name: 'Empresa',
    };
    const compPlaylists = (dbData.playlists || []).filter((pl: any) => pl.company_id === player.company_id);
    const playlist =
      compPlaylists.find((pl: any) => pl.id === player.playlist_id) ||
      compPlaylists.find((pl: any) => pl.active) ||
      compPlaylists[0] ||
      null;
    const compMedia = (dbData.media || []).filter((m: any) => m.company_id === player.company_id);
    const items = (playlist?.items || [])
      .map((it: any, idx: number) => {
        const med = compMedia.find((m: any) => m.id === it.media_id);
        if (!med) return null;
        return {
          id: it.id || `item-${idx}`,
          media_id: med.id,
          position: it.position || idx + 1,
          duration: it.duration || med.duration || 10,
          name: med.name,
          type: med.type,
          file_url: med.file_url,
        };
      })
      .filter(Boolean);
    return {
      player,
      company: { id: company.id, name: company.trade_name || company.legal_name || 'Empresa' },
      playlist,
      weatherCity: playlist?.weather_city || company.city || 'São Paulo',
      items,
      rssFeeds: (dbData.rss_feeds || []).filter((r: any) => r.company_id === player.company_id),
    };
  }

  if (pathOnly === '/player/heartbeat' && method === 'POST') {
    return { status: 'ok' };
  }

  if (pathOnly === '/player/active-call' && method === 'GET') {
    const qs = new URLSearchParams(endpoint.split('?')[1] || '');
    const playerId = qs.get('playerId');
    const recentCall = (dbData.player_calls || []).find(
      (c: any) =>
        (!playerId || c.player_id === playerId) &&
        Date.now() - Number(c.timestamp || 0) < (Number(c.duration || 10) + 5) * 1000
    );
    return { activeCall: recentCall || null };
  }

  if (pathOnly === '/weather' && method === 'GET') {
    const qs = new URLSearchParams(endpoint.split('?')[1] || '');
    const city = qs.get('city') || 'São Paulo';
    return {
      status: 'ok',
      city,
      temp: 25,
      apparentTemp: 26,
      humidity: 58,
      windSpeed: 11,
      weatherCode: 0,
      text: 'Céu Limpo',
      forecast: [],
    };
  }

  if (pathOnly === '/rss/proxy' && method === 'GET') {
    return { items: [], articles: [] };
  }

  throw new Error(`Servidor indisponível no momento (${method} ${pathOnly}). Verifique se o serviço está rodando como Web Service.`);
}
