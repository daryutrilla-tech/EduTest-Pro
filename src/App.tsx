import React, { useState, useEffect } from 'react';
import { 
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  doc, 
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Examen, Usuario, Resultado, AppConfig } from './types';
import { AdminExamEditor } from './components/AdminExamEditor';

// --- ERROR HANDLING ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error Details:', JSON.stringify(errInfo, null, 2));
  return errInfo;
}

import { QuizComponent } from './components/QuizComponent';
import { generateCertificate, generateEvaluationPDF } from './lib/certificate';
import { transformGoogleDriveUrl } from './lib/utils';
import { 
  LogOut, 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Clock, 
  User as UserIcon,
  ShieldCheck,
  LayoutDashboard,
  FileText,
  Download,
  Loader2,
  UserPlus,
  LogIn,
  AlertTriangle,
  Database,
  Plus,
  Trash2,
  Settings,
  Save,
  Users,
  CheckCircle,
  Square,
  CheckSquare,
  Trash,
  Eye,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- MAIN APP ---
export default function App() {
  const [profile, setProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'dashboard' | 'quiz' | 'result' | 'pending_approval'>('login');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [allResults, setAllResults] = useState<Resultado[]>([]);
  const [allUsers, setAllUsers] = useState<Usuario[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [adminTab, setAdminTab] = useState<'mis_examenes' | 'reportes' | 'usuarios' | 'configuracion'>('mis_examenes');
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    fetchExamenes();
    fetchAppConfig();
  }, []);
  
  // Form states
  const [loginName, setLoginName] = useState('');
  const [loginCurp, setLoginCurp] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [loginError, setLoginError] = useState('');

  // Data states
  const [examenes, setExamenes] = useState<Examen[]>([]);
  const [activeExamen, setActiveExamen] = useState<Examen | null>(null);
  const [lastResultado, setLastResultado] = useState<Resultado | null>(null);
  const [historial, setHistorial] = useState<Resultado[]>([]);
  const [isEditingExam, setIsEditingExam] = useState(false);
  const [examToEdit, setExamToEdit] = useState<Examen | null>(null);
  const [userToAssignExams, setUserToAssignExams] = useState<Usuario | null>(null);
  const [bulkSelectedExams, setBulkSelectedExams] = useState<string[]>([]);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [resultToReview, setResultToReview] = useState<{ resultado: Resultado; user: Usuario | null } | null>(null);
  const [resultToDelete, setResultToDelete] = useState<Resultado | null>(null);
  const [viewingUserHistory, setViewingUserHistory] = useState<Usuario | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !profile) {
        setLoading(true);
        try {
          // Try fetching by UID first
          let q = query(collection(db, 'usuarios'), where('authUid', '==', user.uid));
          let querySnapshot = await getDocs(q);
          
          // If not found by UID, try by Email (for social login linking)
          if (querySnapshot.empty && user.email) {
            q = query(collection(db, 'usuarios'), where('email', '==', user.email));
            querySnapshot = await getDocs(q);
          }

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            const updates: any = {};
            
            // Link UID if it's missing or different
            if (userData.authUid !== user.uid) {
              updates.authUid = user.uid;
            }

            // Auto-promote to Admin if email matches
            if (user.email === 'daryutrilla@gmail.com' && userData.rol !== 'Admin') {
              updates.rol = 'Admin';
            }
            
            if (Object.keys(updates).length > 0) {
              await updateDoc(userDoc.ref, updates);
            }
            
            const userProfile = { uid: userDoc.id, ...userData, ...updates, authUid: user.uid } as any;
            setProfile(userProfile);
            
            if (userProfile.rol !== 'Admin' && userProfile.estado !== 'activo') {
              setView('pending_approval');
            } else {
              setView('dashboard');
              fetchExamenes();
              fetchHistorial(userDoc.id);
              if (userProfile.rol === 'Admin') {
                fetchAllDataForAdmin(userProfile);
              }
            }
          }
        } catch (error) {
          console.error('Auth state change error:', error);
        } finally {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [profile]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setLoginError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email));
      const querySnapshot = await getDocs(q);

      let userProfile: Usuario;

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const updates: any = {};
        
        if (userData.authUid !== user.uid) {
          updates.authUid = user.uid;
        }
        
        // Auto-promote to Admin if email matches
        if (user.email === 'daryutrilla@gmail.com') {
          if (userData.rol !== 'Admin') updates.rol = 'Admin';
          if (userData.estado !== 'activo') updates.estado = 'activo';
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDoc(userDoc.ref, updates);
        }
        
        userProfile = { uid: userDoc.id, ...userData, ...updates } as any;
        setNotification({ message: `Bienvenido de nuevo, ${userProfile.nombreCompleto}.`, type: 'success' });
      } else {
        const isAdmin = user.email === 'daryutrilla@gmail.com';
        const newUser = {
          nombreCompleto: user.displayName || 'Usuario Google',
          curp: 'PENDIENTE',
          rol: isAdmin ? 'Admin' : 'Alumno',
          estado: isAdmin ? 'activo' : 'pendiente',
          examenesHabilitados: [],
          email: user.email || '',
          authUid: user.uid
        };
        const docRef = await addDoc(collection(db, 'usuarios'), newUser);
        userProfile = { uid: docRef.id, ...newUser } as any;
      }

      setProfile(userProfile);
      
      if (userProfile.rol !== 'Admin' && userProfile.estado !== 'activo') {
        setView('pending_approval');
      } else {
        setView('dashboard');
        fetchExamenes();
        fetchHistorial(userProfile.uid);
        if (userProfile.rol === 'Admin') {
          fetchAllDataForAdmin(userProfile);
        }
      }
    } catch (error: any) {
      console.error('Google Login error:', error);
      
      if (error.code === 'auth/account-exists-with-different-credential') {
        setLoginError('Ya existe una cuenta con este correo pero registrada con otro método (CURP o correo/contraseña).');
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError('El navegador bloqueó la ventana emergente. Por favor, permite ventanas emergentes.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setLoginError('Cerraste la ventana de inicio de sesión antes de terminar.');
      } else {
        setLoginError(`Error al iniciar sesión con Google: ${error.message || 'Error desconocido'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword || !loginName || !loginCurp) {
      setLoginError('Todos los campos son obligatorios.');
      return;
    }

    setLoading(true);
    setLoginError('');

    // Automate email using CURP if email is not provided
    const finalEmail = loginEmail || `${loginCurp.toLowerCase().trim()}@edutest.pro`;

    try {
      // 1. Create user in Firebase Auth
      const authResult = await createUserWithEmailAndPassword(auth, finalEmail, loginPassword);
      const authUid = authResult.user.uid;

      // 2. Check if CURP already exists in Firestore
      const q = query(collection(db, 'usuarios'), where('curp', '==', loginCurp.toUpperCase().trim()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(userDoc.ref, { 
          authUid, 
          email: finalEmail,
          nombreCompleto: loginName.toUpperCase().trim() 
        });
        const userProfile = { uid: userDoc.id, ...userDoc.data(), authUid, email: finalEmail } as any;
        setProfile(userProfile);
      } else {
        const newUser = {
          nombreCompleto: loginName.toUpperCase().trim(),
          curp: loginCurp.toUpperCase().trim(),
          rol: finalEmail === 'daryutrilla@gmail.com' ? 'Admin' : 'Alumno',
          estado: finalEmail === 'daryutrilla@gmail.com' ? 'activo' : 'pendiente',
          examenesHabilitados: [],
          email: finalEmail,
          authUid
        };
        const docRef = await addDoc(collection(db, 'usuarios'), newUser);
        const userProfile = { uid: docRef.id, ...newUser } as any;
        setProfile(userProfile);
      }

      setNotification({ message: 'Registro exitoso.', type: 'success' });
      setView('pending_approval');
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        setLoginError('Este CURP o correo ya está registrado.');
      } else if (error.code === 'auth/weak-password') {
        setLoginError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setLoginError('Error al registrar. Verifica tus datos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCurp || !loginPassword) {
      setLoginError('Ingresa tus credenciales.');
      return;
    }

    setLoading(true);
    setLoginError('');

    // If input contains '@', treat as email, otherwise treat as CURP
    const finalEmail = loginCurp.includes('@') ? loginCurp.trim() : `${loginCurp.toLowerCase().trim()}@edutest.pro`;

    try {
      await signInWithEmailAndPassword(auth, finalEmail, loginPassword);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError('CURP/Correo o contraseña incorrectos.');
      } else {
        setLoginError('Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      setNotification({ message: 'Ingresa tu correo para el restablecimiento.', type: 'error' });
      return;
    }
    
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setNotification({ message: 'Se ha enviado un correo para restablecer tu contraseña.', type: 'success' });
      setShowForgotPassword(false);
    } catch (error: any) {
      console.error('Reset password error:', error);
      setNotification({ message: 'No se pudo enviar el correo. Verifica el formato.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCurpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCurp) {
      setLoginError('Por favor ingresa tu CURP.');
      return;
    }

    setLoading(true);
    setLoginError('');

    try {
      // 1. Sign in anonymously to have a valid Firebase Auth session
      // NOTE: This requires "Anonymous Authentication" to be enabled in Firebase Console
      const authResult = await signInAnonymously(auth);
      const authUid = authResult.user.uid;

      // 2. Check if user exists by CURP
      const q = query(collection(db, 'usuarios'), where('curp', '==', loginCurp.toUpperCase()));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'usuarios');
        throw err;
      }
      
      let userProfile: Usuario;

      if (!querySnapshot.empty) {
        // User exists - link their document to the current auth session
        const userDoc = querySnapshot.docs[0];
        try {
          await updateDoc(userDoc.ref, { authUid });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `usuarios/${userDoc.id}`);
          throw err;
        }
        userProfile = { uid: userDoc.id, ...userDoc.data(), authUid } as any;
        setNotification({ message: `Bienvenido de nuevo, ${userProfile.nombreCompleto}.`, type: 'success' });
      } else {
        // User doesn't exist - name is required for registration
        if (!loginName) {
          setLoginError('Tu CURP no está registrada. Por favor ingresa tu nombre completo para registrarte.');
          setLoading(false);
          return;
        }

        // 3. Register automatically if not exists
        const newUser = {
          nombreCompleto: loginName.toUpperCase(),
          curp: loginCurp.toUpperCase(),
          rol: 'Alumno',
          estado: 'pendiente',
          examenesHabilitados: [],
          authUid
        };
        let docRef;
        try {
          docRef = await addDoc(collection(db, 'usuarios'), newUser);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'usuarios');
          throw err;
        }
        userProfile = { uid: docRef.id, ...newUser, authUid } as any;
      }

      setProfile(userProfile);
      
      if (userProfile.rol !== 'Admin' && userProfile.estado !== 'activo') {
        setView('pending_approval');
      } else {
        setView('dashboard');
        fetchExamenes();
        fetchHistorial(userProfile.uid);
        if (userProfile.rol === 'Admin') {
          fetchAllDataForAdmin(userProfile);
        }
      }
    } catch (error: any) {
      console.error('Login error details:', {
        code: error.code,
        message: error.message,
        fullError: error
      });
      
      if (error.code === 'auth/operation-not-allowed') {
        setLoginError('El inicio de sesión con CURP requiere que el administrador habilite "Anonymous Auth" en Firebase Console (Authentication > Sign-in method).');
      } else if (error.code === 'auth/network-request-failed') {
        setLoginError('Error de red al conectar con Firebase. Por favor, verifica tu conexión.');
      } else if (error.code === 'permission-denied') {
        setLoginError('Error de permisos en la base de datos. Por favor, contacta al administrador.');
      } else {
        setLoginError(`Error de autenticación (${error.code || 'desconocido'}). Por favor, intenta de nuevo o usa Google.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchExamenes = async () => {
    try {
      const q = query(collection(db, 'examenes'));
      const querySnapshot = await getDocs(q);
      const exams = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Examen));
      setExamenes(exams);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'examenes');
    }
  };

  const fetchAppConfig = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'configuracion'));
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        const logoUrl = transformGoogleDriveUrl(data.logoUrl || 'https://cdn-icons-png.flaticon.com/512/3233/3233508.png');
        const secondaryLogoUrl = transformGoogleDriveUrl(data.secondaryLogoUrl || '');
        const plantillaUrl = transformGoogleDriveUrl(data.plantillaUrl || '');
        const firmaUrl = transformGoogleDriveUrl(data.firmaUrl || '');
        setAppConfig({ 
          id: doc.id, 
          nombrePlataforma: data.nombrePlataforma || 'EduTest Pro',
          logoUrl: logoUrl,
          secondaryLogoUrl: secondaryLogoUrl,
          plantillaUrl: plantillaUrl,
          firmaUrl: firmaUrl,
          nombreEvaluador: data.nombreEvaluador || ''
        } as AppConfig);
      } else {
        const defaultConfig = {
          logoUrl: 'https://cdn-icons-png.flaticon.com/512/3233/3233508.png',
          secondaryLogoUrl: '',
          plantillaUrl: '',
          firmaUrl: '',
          nombreEvaluador: '',
          nombrePlataforma: 'EduTest Pro'
        };
        const docRef = await addDoc(collection(db, 'configuracion'), defaultConfig);
        setAppConfig({ id: docRef.id, ...defaultConfig });
      }
    } catch (error) {
      console.error('Error fetching app config:', error);
    }
  };

  const fetchHistorial = async (usuarioId: string) => {
    if (!usuarioId) return;
    
    try {
      const q = query(
        collection(db, 'resultados'), 
        where('usuarioId', '==', usuarioId),
        orderBy('fecha', 'desc'),
        limit(20)
      );
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resultado));
      setHistorial(results);
    } catch (error) {
      console.error('Error fetching historial:', error);
      // Fallback without orderBy if index is not ready
      try {
        const qFallback = query(
          collection(db, 'resultados'), 
          where('usuarioId', '==', usuarioId),
          limit(20)
        );
        const snapshot = await getDocs(qFallback);
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resultado));
        setHistorial(results);
      } catch (e) {
        console.error('Fallback fetchHistorial failed:', e);
      }
    }
  };

  const fetchAllDataForAdmin = async (overrideProfile?: Usuario) => {
    const currentProfile = overrideProfile || profile;
    if (currentProfile?.rol !== 'Admin') return;
    
    try {
      // Fetch all results
      const resultsQuery = query(collection(db, 'resultados'), orderBy('fecha', 'desc'));
      const resultsSnapshot = await getDocs(resultsQuery);
      const results = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resultado));
      setAllResults(results);

      // Fetch all users to map names
      const usersQuery = query(collection(db, 'usuarios'));
      const usersSnapshot = await getDocs(usersQuery);
      const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Usuario));
      setAllUsers(users);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    }
  };

  const handleStartExamen = (examen: Examen) => {
    if (profile?.examenesBloqueados?.includes(examen.id)) {
      setNotification({ message: 'Esta evaluación está bloqueada debido a intentos no permitidos de salida de la ventana. Contacta al administrador.', type: 'error' });
      return;
    }
    setActiveExamen(examen);
    setView('quiz');
  };

  const handleBlockExam = async (examenId: string) => {
    if (!profile) return;
    try {
      const userRef = doc(db, 'usuarios', profile.uid);
      const currentBloqueados = profile.examenesBloqueados || [];
      if (!currentBloqueados.includes(examenId)) {
        const updatedBloqueados = [...currentBloqueados, examenId];
        await updateDoc(userRef, { examenesBloqueados: updatedBloqueados });
        setProfile({ ...profile, examenesBloqueados: updatedBloqueados });
      }
    } catch (error) {
      console.error('Error locking exam:', error);
    }
  };

  const handleUnlockExam = async (userId: string, examenId: string) => {
    setLoading(true);
    try {
      const userToUpdate = allUsers.find(u => u.uid === userId);
      if (userToUpdate) {
        const updatedBloqueados = (userToUpdate.examenesBloqueados || []).filter(id => id !== examenId);
        await updateDoc(doc(db, 'usuarios', userId), { examenesBloqueados: updatedBloqueados });
        setNotification({ message: 'Evaluación desbloqueada correctamente para el usuario.', type: 'success' });
        fetchAllDataForAdmin();
      }
    } catch (error) {
      console.error('Error unlocking exam:', error);
      setNotification({ message: 'No se pudo desbloquear la evaluación.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleQuizComplete = async (respuestas: number[]) => {
    if (!activeExamen || !profile) return;

    let correctas = 0;
    activeExamen.preguntas.forEach((p, i) => {
      if (respuestas[i] === p.respuestaCorrecta) correctas++;
    });

    const puntaje = Math.round((correctas / activeExamen.preguntas.length) * 100);
    const aprobado = puntaje >= activeExamen.calificacionMinima;

    const nuevoResultado: any = {
      usuarioId: profile.uid,
      authUid: (profile as any).authUid,
      examenId: activeExamen.id,
      examenTitulo: activeExamen.titulo,
      puntaje,
      fecha: new Date().toISOString(),
      fecha_finalizacion: serverTimestamp(),
      aprobado,
      respuestasUsuario: respuestas
    };

    try {
      const docRef = await addDoc(collection(db, 'resultados'), nuevoResultado);
      setLastResultado({ ...nuevoResultado, id: docRef.id });
      setView('result');
      fetchHistorial(profile.uid);
    } catch (error) {
      console.error('Error saving result:', error);
      setNotification({ message: 'Hubo un error al guardar tus resultados. Por favor, intenta de nuevo.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setProfile(null);
    setView('login');
    setLoginName('');
    setLoginCurp('');
    setLoginError('');
  };

  const handleSaveExam = async (examenData: Omit<Examen, 'id'> & { id?: string }) => {
    setLoading(true);
    try {
      const { id, ...data } = examenData;
      if (id) {
        const examRef = doc(db, 'examenes', id);
        await updateDoc(examRef, data as any);
        setNotification({ message: 'Examen actualizado con éxito.', type: 'success' });
      } else {
        await addDoc(collection(db, 'examenes'), data);
        setNotification({ message: 'Examen creado con éxito.', type: 'success' });
      }
      setIsEditingExam(false);
      setExamToEdit(null);
      fetchExamenes();
    } catch (error) {
      console.error('Error saving exam:', error);
      setNotification({ message: 'Error al guardar el examen.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (examenId: string) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'examenes', examenId));
      setNotification({ message: 'Examen eliminado con éxito.', type: 'success' });
      fetchExamenes();
    } catch (error) {
      console.error('Error deleting exam:', error);
      setNotification({ message: 'Error al eliminar el examen.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserStatus = async (userId: string, newStatus: 'activo' | 'bloqueado' | 'pendiente') => {
    setLoading(true);
    try {
      const userRef = doc(db, 'usuarios', userId);
      await updateDoc(userRef, { estado: newStatus });
      setNotification({ message: `Usuario actualizado a ${newStatus}.`, type: 'success' });
      fetchAllDataForAdmin();
    } catch (error) {
      console.error('Error updating user status:', error);
      setNotification({ message: 'Error al actualizar el estado del usuario.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(true);
    try {
      // 1. Delete associated results
      const resultsQuery = query(collection(db, 'resultados'), where('usuarioId', '==', userId));
      const resultsSnapshot = await getDocs(resultsQuery);
      const deleteResultsPromises = resultsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteResultsPromises);

      // 2. Delete the user document
      await deleteDoc(doc(db, 'usuarios', userId));
      
      setNotification({ message: 'Usuario y sus datos eliminados con éxito.', type: 'success' });
      fetchAllDataForAdmin();
      setSelectedUsers(prev => prev.filter(id => id !== userId));
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setNotification({ message: 'Error al eliminar el usuario.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdateStatus = async (status: 'activo' | 'bloqueado') => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    try {
      const promises = selectedUsers.map(uid => 
        updateDoc(doc(db, 'usuarios', uid), { estado: status })
      );
      await Promise.all(promises);
      setNotification({ message: `${selectedUsers.length} usuarios actualizados a ${status}.`, type: 'success' });
      fetchAllDataForAdmin();
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error in bulk status update:', error);
      setNotification({ message: 'Error al actualizar usuarios en lote.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    try {
      const promises = selectedUsers.map(async (uid) => {
        // Delete results first
        const resultsQuery = query(collection(db, 'resultados'), where('usuarioId', '==', uid));
        const resultsSnapshot = await getDocs(resultsQuery);
        const deleteResultsPromises = resultsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteResultsPromises);

        // Then delete user
        return deleteDoc(doc(db, 'usuarios', uid));
      });
      
      await Promise.all(promises);
      setNotification({ message: `${selectedUsers.length} usuarios y sus datos eliminados con éxito.`, type: 'success' });
      fetchAllDataForAdmin();
      setSelectedUsers([]);
      setIsBulkDeleting(false);
    } catch (error) {
      console.error('Error in bulk delete:', error);
      setNotification({ message: 'Error al eliminar usuarios en lote.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssignExams = async (examIds: string[]) => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    try {
      const promises = selectedUsers.map(async (uid) => {
        const user = allUsers.find(u => u.uid === uid);
        if (!user) return;
        const currentExams = user.examenesHabilitados || [];
        // Unique merge
        const newExams = Array.from(new Set([...currentExams, ...examIds]));
        return updateDoc(doc(db, 'usuarios', uid), { examenesHabilitados: newExams });
      });
      await Promise.all(promises);
      setNotification({ message: `Exámenes asignados a ${selectedUsers.length} usuarios.`, type: 'success' });
      fetchAllDataForAdmin();
      setSelectedUsers([]);
      setUserToAssignExams(null);
    } catch (error) {
      console.error('Error in bulk exam assignment:', error);
      setNotification({ message: 'Error al asignar exámenes en lote.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResult = async (resultId: string) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'resultados', resultId));
      setNotification({ message: 'Resultado eliminado con éxito.', type: 'success' });
      fetchAllDataForAdmin();
      setResultToDelete(null);
    } catch (error) {
      console.error('Error deleting result:', error);
      setNotification({ message: 'Error al eliminar el resultado.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserExam = async (userId: string, examId: string, currentExams: string[] = []) => {
    const newExams = currentExams.includes(examId) 
      ? currentExams.filter(id => id !== examId)
      : [...currentExams, examId];
    
    try {
      const userRef = doc(db, 'usuarios', userId);
      await updateDoc(userRef, { examenesHabilitados: newExams });
      setNotification({ message: 'Exámenes del usuario actualizados.', type: 'success' });
      fetchAllDataForAdmin();
      
      // Update local state for modal if open
      if (userToAssignExams && userToAssignExams.uid === userId) {
        setUserToAssignExams({ ...userToAssignExams, examenesHabilitados: newExams });
      }
    } catch (error) {
      console.error('Error updating user exams:', error);
      setNotification({ message: 'Error al actualizar exámenes del usuario.', type: 'error' });
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appConfig) return;
    setLoading(true);
    try {
      const finalLogoUrl = transformGoogleDriveUrl(appConfig.logoUrl || '');
      const finalSecondaryLogoUrl = transformGoogleDriveUrl(appConfig.secondaryLogoUrl || '');
      const finalPlantillaUrl = transformGoogleDriveUrl(appConfig.plantillaUrl || '');
      const finalFirmaUrl = transformGoogleDriveUrl(appConfig.firmaUrl || '');
      await updateDoc(doc(db, 'configuracion', appConfig.id), {
        logoUrl: finalLogoUrl,
        secondaryLogoUrl: finalSecondaryLogoUrl,
        plantillaUrl: finalPlantillaUrl,
        firmaUrl: finalFirmaUrl,
        nombreEvaluador: appConfig.nombreEvaluador || '',
        nombrePlataforma: appConfig.nombrePlataforma
      });
      setAppConfig({ 
        ...appConfig, 
        logoUrl: finalLogoUrl, 
        secondaryLogoUrl: finalSecondaryLogoUrl,
        plantillaUrl: finalPlantillaUrl,
        firmaUrl: finalFirmaUrl 
      });
      setNotification({ message: 'Configuración guardada correctamente.', type: 'success' });
    } catch (error) {
      console.error('Error saving config:', error);
      setNotification({ message: 'Error al guardar la configuración.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading && view === 'login') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={48} />
          <p className="text-slate-600 font-medium">Verificando credenciales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* NOTIFICATION TOAST */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              notification.type === 'success' 
                ? 'bg-emerald-500 text-white border-emerald-400' 
                : 'bg-red-500 text-white border-red-400'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold tracking-wide">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Bar */}
      {profile && (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-600 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                  {appConfig?.logoUrl ? (
                    <img src={appConfig.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <ShieldCheck className="text-white" size={24} />
                  )}
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-800">{appConfig?.nombrePlataforma || 'EduTest'} {!appConfig?.nombrePlataforma && <span className="text-indigo-600">Pro</span>}</span>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-bold text-slate-700">{profile.nombreCompleto}</span>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{profile.curp}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                  title="Cerrar Sesión"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* EXAM EDITOR MODAL */}
          {isEditingExam && (
            <AdminExamEditor 
              examen={examToEdit}
              onSave={handleSaveExam}
              onCancel={() => {
                setIsEditingExam(false);
                setExamToEdit(null);
              }}
              loading={loading}
            />
          )}

          {/* ASSIGN EXAMS MODAL */}
          {userToAssignExams && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">
                      {userToAssignExams.uid === 'multiple' ? 'Asignación Masiva' : 'Asignar Evaluaciones'}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {userToAssignExams.uid === 'multiple' 
                        ? `${selectedUsers.length} usuarios seleccionados` 
                        : userToAssignExams.nombreCompleto}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setUserToAssignExams(null);
                      setBulkSelectedExams([]);
                    }}
                    className="p-2 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <XCircle size={24} className="text-slate-400" />
                  </button>
                </div>
                
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                  {userToAssignExams.uid === 'multiple' && (
                    <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                        <AlertTriangle size={14} />
                        NOTA: Los exámenes seleccionados se AGREGARÁN a los ya existentes de cada usuario.
                      </p>
                    </div>
                  )}
                  {examenes.map(ex => {
                    const isAssigned = userToAssignExams.uid === 'multiple'
                      ? bulkSelectedExams.includes(ex.id)
                      : userToAssignExams.examenesHabilitados?.includes(ex.id);
                    
                    return (
                      <button
                        key={ex.id}
                        onClick={() => {
                          if (userToAssignExams.uid === 'multiple') {
                            setBulkSelectedExams(prev => 
                              prev.includes(ex.id) ? prev.filter(id => id !== ex.id) : [...prev, ex.id]
                            );
                          } else {
                            handleToggleUserExam(userToAssignExams.uid, ex.id, userToAssignExams.examenesHabilitados);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          isAssigned 
                            ? 'border-indigo-600 bg-indigo-50' 
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className={`font-bold ${isAssigned ? 'text-indigo-700' : 'text-slate-700'}`}>{ex.titulo}</p>
                          <p className="text-xs text-slate-400">{ex.preguntas.length} preguntas • {ex.tiempoLimite} min</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isAssigned ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'
                        }`}>
                          {isAssigned && <CheckCircle2 size={14} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                  {examenes.length === 0 && (
                    <p className="text-center text-slate-400 italic py-8">No hay exámenes creados para asignar.</p>
                  )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100">
                  {userToAssignExams.uid === 'multiple' ? (
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          setUserToAssignExams(null);
                          setBulkSelectedExams([]);
                        }}
                        className="flex-1 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => handleBulkAssignExams(bulkSelectedExams)}
                        disabled={bulkSelectedExams.length === 0}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                      >
                        Aplicar a Todos
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setUserToAssignExams(null)}
                      className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
                    >
                      Cerrar y Guardar
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {/* USER RESULTS HISTORY MODAL */}
          {viewingUserHistory && (
            <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white">
                      <LayoutDashboard size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Historial de Evaluaciones</h2>
                      <p className="text-sm text-slate-500">{viewingUserHistory.nombreCompleto} • {viewingUserHistory.curp}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setViewingUserHistory(null)}
                    className="p-2 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <XCircle size={24} className="text-slate-400" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                  {allResults.filter(r => r.usuarioId === viewingUserHistory.uid).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allResults.filter(r => r.usuarioId === viewingUserHistory.uid).map(res => (
                        <div key={res.id} className="p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-200 transition-all flex flex-col shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              res.aprobado ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {res.aprobado ? 'Aprobado' : 'Reprobado'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(res.fecha).toLocaleString()}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 mb-1 line-clamp-1">{res.examenTitulo}</h4>
                          <div className="flex items-end justify-between mt-auto pt-4 border-t border-slate-50">
                            <div>
                              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Puntaje</p>
                              <p className={`text-2xl font-black ${res.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>{res.puntaje}%</p>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setResultToReview({ resultado: res, user: viewingUserHistory })}
                                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all"
                                title="Revisar Respuestas"
                              >
                                <Eye size={18} />
                              </button>
                              {res.aprobado && (
                                <button 
                                  onClick={() => generateCertificate(res, viewingUserHistory!, appConfig?.logoUrl, appConfig?.firmaUrl, appConfig?.secondaryLogoUrl, appConfig?.nombreEvaluador, appConfig?.plantillaUrl)}
                                  className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                                  title="Certificado"
                                >
                                  <Download size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="font-medium italic">Este usuario aún no ha realizado ninguna evaluación.</p>
                    </div>
                  )}
                </div>
                
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button 
                    onClick={() => setViewingUserHistory(null)}
                    className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
                  >
                    Cerrar Historial
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* SINGLE USER DELETE CONFIRMATION */}
          {userToDelete && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar Usuario?</h2>
                  <p className="text-slate-500 mb-6">
                    Estas a punto de eliminar a <span className="font-bold text-slate-700">{userToDelete.nombreCompleto}</span>. 
                    Esta acción borrará permanentemente su perfil y todos sus resultados de exámenes. Esta acción no se puede deshacer.
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setUserToDelete(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(userToDelete.uid)}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                    >
                      Eliminar Todo
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* BULK USER DELETE CONFIRMATION */}
          {isBulkDeleting && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Eliminar Seleccionados</h2>
                  <p className="text-slate-500 mb-6">
                    Vas a eliminar a <span className="font-bold text-slate-700">{selectedUsers.length} usuarios</span> y todos sus datos asociados. 
                    Esto es irreversible.
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setIsBulkDeleting(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleBulkDelete}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                    >
                      Eliminar en Lote
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* EVALUATION REVIEW MODAL */}
          {resultToReview && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm no-print">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 no-print">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Revisión de Evaluación</h2>
                    <p className="text-sm text-slate-500">
                      Cuestionario: <span className="font-bold text-slate-700">{resultToReview.resultado.examenTitulo}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const ex = examenes.find(e => e.id === resultToReview.resultado.examenId);
                        if (ex && resultToReview.user) {
                          generateEvaluationPDF(resultToReview.resultado, resultToReview.user, ex);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      <Download size={20} />
                      PDF
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        window.focus();
                        window.print();
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      <Printer size={20} />
                      Imprimir
                    </button>
                    <button 
                      onClick={() => setResultToReview(null)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400"
                    >
                      <XCircle size={24} />
                    </button>
                  </div>
                </div>

                {/* Modal Content / Print Area */}
                <div id="print-area" className="flex-1 overflow-y-auto p-8 print-container">
                  {/* Header for Print */}
                  <div className="hidden print:block mb-8 text-center border-b pb-6">
                    <h1 className="text-2xl font-bold uppercase mb-2">Evidencia de Evaluación</h1>
                    <p className="text-slate-600">Plataforma: {appConfig?.nombrePlataforma || 'EduTest Pro'}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100 print:bg-white print:border-none print:p-0">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Alumno</p>
                      <p className="text-lg font-bold text-slate-800">{resultToReview.user?.nombreCompleto || 'Desconocido'}</p>
                      <p className="text-sm text-slate-500">CURP: {resultToReview.user?.curp || 'N/A'}</p>
                    </div>
                    <div className="md:text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Aplicación</p>
                      <p className="text-lg font-bold text-slate-800">{new Date(resultToReview.resultado.fecha).toLocaleDateString()} {new Date(resultToReview.resultado.fecha).toLocaleTimeString()}</p>
                      <p className={`text-sm font-bold uppercase ${resultToReview.resultado.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>
                        Calificación: {resultToReview.resultado.puntaje}% - {resultToReview.resultado.aprobado ? 'APROBADO' : 'REPROBADO'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {(() => {
                      const examen = examenes.find(e => e.id === resultToReview.resultado.examenId);
                      if (!examen) return <p className="text-slate-400 italic">No se pudo cargar el contenido original de las preguntas para este examen.</p>;
                      
                      return examen.preguntas.map((p, idx) => {
                        const userAnsIdx = resultToReview.resultado.respuestasUsuario[idx];
                        const isCorrect = userAnsIdx === p.respuestaCorrecta;
                        
                        return (
                          <div key={idx} className="border-b border-slate-100 pb-6 last:border-0 print:break-inside-avoid shadow-none">
                            <p className="font-bold text-slate-800 mb-4 flex gap-2">
                              <span className="text-indigo-600">Q{idx + 1}.</span> {p.pregunta}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {p.opciones.map((opt, oIdx) => {
                                const isUserChoice = oIdx === userAnsIdx;
                                const isCorrectChoice = oIdx === p.respuestaCorrecta;
                                
                                return (
                                  <div 
                                    key={oIdx}
                                    className={`p-3 rounded-xl border flex items-center justify-between ${
                                      isUserChoice && isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                      isUserChoice && !isCorrect ? 'border-red-200 bg-red-50 text-red-700' :
                                      isCorrectChoice ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                      'border-slate-100 bg-white'
                                    }`}
                                  >
                                    <span className="text-sm">{opt}</span>
                                    <div className="flex gap-2">
                                      {isUserChoice && (
                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isCorrect ? 'bg-emerald-200' : 'bg-red-200'}`}>
                                          Respuesta Usuario
                                        </span>
                                      )}
                                      {isCorrectChoice && !isUserChoice && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                                          Correcta
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  
                  {/* Signature line for evidence */}
                  <div className="hidden print:block mt-20">
                    <div className="flex justify-between">
                      <div className="text-center w-64 border-t border-slate-900 pt-2">
                        <p className="text-sm font-bold">Firma del Alumno</p>
                        <p className="text-xs text-slate-500">{resultToReview.user?.nombreCompleto}</p>
                      </div>
                      <div className="text-center w-64 border-t border-slate-900 pt-2">
                        <p className="text-sm font-bold">Firma del Evaluador</p>
                        <p className="text-xs text-slate-500">Administrador</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 no-print flex justify-end">
                  <button 
                    onClick={() => setResultToReview(null)}
                    className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                  >
                    Cerrar Revisión
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* RESULT DELETE CONFIRMATION */}
          {resultToDelete && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar Registro?</h2>
                  <p className="text-slate-500 mb-6">
                    Vas a eliminar el resultado del examen <span className="font-bold text-slate-700">{resultToDelete.examenTitulo}</span> aplicado el <span className="font-bold text-slate-700">{new Date(resultToDelete.fecha).toLocaleDateString()}</span>. 
                    Esta acción es permanente y no se puede deshacer.
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setResultToDelete(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={() => handleDeleteResult(resultToDelete.id)}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                    >
                      Eliminar Registro
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* FORGOT PASSWORD MODAL */}
          {showForgotPassword && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8"
              >
                <h2 className="text-xl font-bold text-slate-800 mb-2">Restablecer Contraseña</h2>
                <p className="text-slate-500 text-sm mb-6">
                  Se enviará un enlace de recuperación a tu correo electrónico. Si te registraste solo con CURP, contacta a tu administrador.
                </p>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Correo Electrónico</label>
                    <input 
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowForgotPassword(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Enviar'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {/* LOGIN VIEW */}
          {view === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto mt-12"
            >
              <div className="bg-white p-8 rounded-3xl shadow-2xl shadow-indigo-100 border border-slate-100">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200 overflow-hidden">
                  {appConfig?.logoUrl ? (
                    <img src={appConfig.logoUrl} alt="App Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    authMode === 'login' ? <LogIn size={32} className="text-white" /> : <UserPlus size={32} className="text-white" />
                  )}
                </div>
                <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">
                  {authMode === 'login' ? 'Iniciar Sesión' : 'Registrar Cuenta'}
                </h1>
                <p className="text-slate-500 text-center mb-8">
                  {authMode === 'login' ? 'Bienvenido de nuevo, ingresa tus credenciales.' : 'Crea tu cuenta para comenzar tus evaluaciones.'}
                </p>
                
                <div className="flex bg-slate-100 p-1 rounded-xl mb-6 border border-slate-200">
                  <button 
                    onClick={() => {
                      setAuthMode('login');
                      setLoginError('');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${authMode === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Ingresar
                  </button>
                  <button 
                    onClick={() => {
                      setAuthMode('register');
                      setLoginError('');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${authMode === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Registrarme
                  </button>
                </div>

                <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
                  {authMode === 'register' && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wide">Nombre Completo</label>
                      <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          placeholder="Ej. Juan Pérez García"
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                          required={authMode === 'register'}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wide">CURP</label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={loginCurp}
                        onChange={(e) => setLoginCurp(e.target.value)}
                        placeholder="Ingresa tus 18 caracteres"
                        maxLength={18}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all uppercase"
                        required
                      />
                    </div>
                  </div>

                  {authMode === 'register' && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wide">Correo (Opcional)</label>
                      <div className="relative">
                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="email" 
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="tu@correo.com (para recuperaciones)"
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Contraseña</label>
                      {authMode === 'login' && (
                        <button 
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-all"
                        >
                          ¿Olvidaste tu contraseña?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="password" 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
                    {authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                  </button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase font-bold tracking-widest text-slate-400">
                    <span className="px-4 bg-white">Otras opciones</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                    Google
                  </button>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">Verificación de Identidad por CURP</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* DASHBOARD VIEW */}
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Panel de Control</h1>
                  <p className="text-slate-500 mt-2">Gestiona tus evaluaciones y revisa tu progreso académico.</p>
                </div>
                <div className="flex gap-3">
                  {profile?.rol === 'Admin' && (
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
                      <button 
                        onClick={() => setAdminTab('mis_examenes')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${adminTab === 'mis_examenes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Mis Exámenes
                      </button>
                      <button 
                        onClick={() => {
                          setAdminTab('reportes');
                          fetchAllDataForAdmin();
                        }}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${adminTab === 'reportes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Reportes
                      </button>
                      <button 
                        onClick={() => {
                          setAdminTab('usuarios');
                          fetchAllDataForAdmin();
                        }}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${adminTab === 'usuarios' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Usuarios
                      </button>
                      <button 
                        onClick={() => setAdminTab('configuracion')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${adminTab === 'configuracion' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Configuración
                      </button>
                    </div>
                  )}
                  {profile?.rol === 'Admin' && adminTab === 'mis_examenes' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setExamToEdit(null);
                          setIsEditingExam(true);
                        }}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-2"
                      >
                        <Plus size={20} />
                        Nuevo Examen
                      </button>
                    </div>
                  )}
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                    <Award className="text-amber-500" size={20} />
                    <span className="font-bold text-slate-700">{historial.filter(h => h.aprobado).length} Aprobados</span>
                  </div>
                </div>
              </header>

              {profile?.rol === 'Admin' && adminTab === 'reportes' ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <LayoutDashboard className="text-indigo-600" size={24} />
                    <h2 className="text-xl font-bold text-slate-800">Reporte General de Evaluaciones</h2>
                  </div>
                  
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Alumno</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CURP</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Evaluación</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Puntaje</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Estado</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {allResults.length > 0 ? allResults.map((res) => {
                            const user = allUsers.find(u => u.uid === res.usuarioId || u.authUid === res.authUid);
                            return (
                              <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                      {user?.nombreCompleto?.charAt(0) || '?'}
                                    </div>
                                    <span className="font-bold text-slate-700">{user?.nombreCompleto || 'Desconocido'}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm text-slate-500 font-mono">{user?.curp || 'N/A'}</td>
                                <td className="p-4 text-sm text-slate-700 font-medium">{res.examenTitulo}</td>
                                <td className="p-4 text-sm text-slate-400">{new Date(res.fecha).toLocaleDateString()}</td>
                                <td className="p-4 text-center">
                                  <span className={`font-bold ${res.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {res.puntaje}%
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    res.aprobado ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {res.aprobado ? 'Aprobado' : 'Reprobado'}
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button 
                                      onClick={() => setResultToReview({ resultado: res, user: user || null })}
                                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                      title="Revisar Evaluación"
                                    >
                                      <Eye size={18} />
                                    </button>
                                    {res.aprobado && (
                                      <button 
                                        onClick={() => generateCertificate(res, user || { nombreCompleto: 'Alumno', curp: 'N/A' } as any, appConfig?.logoUrl, appConfig?.firmaUrl, appConfig?.secondaryLogoUrl, appConfig?.nombreEvaluador, appConfig?.plantillaUrl)}
                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        title="Descargar Certificado"
                                      >
                                        <Download size={18} />
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => setResultToDelete(res)}
                                      className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all"
                                      title="Eliminar Registro"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={7} className="p-12 text-center text-slate-400 font-medium italic">
                                No hay resultados registrados aún.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : profile?.rol === 'Admin' && adminTab === 'usuarios' ? (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <UserPlus className="text-indigo-600" size={24} />
                      <h2 className="text-xl font-bold text-slate-800">Gestión de Usuarios y Accesos</h2>
                    </div>

                    {selectedUsers.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100"
                      >
                        <span className="text-sm font-bold text-indigo-600 mr-2">
                          {selectedUsers.length} seleccionados
                        </span>
                        <div className="h-6 w-px bg-indigo-200 mx-2" />
                        <button 
                          onClick={() => handleBulkUpdateStatus('activo')}
                          className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all"
                          title="Aprobar seleccionados"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button 
                          onClick={() => handleBulkUpdateStatus('bloqueado')}
                          className="p-2 text-amber-600 hover:bg-amber-100 rounded-xl transition-all"
                          title="Bloquear seleccionados"
                        >
                          <ShieldCheck size={20} />
                        </button>
                        <button 
                          onClick={() => {
                            // Using a special case where we pass a dummy user or flag
                            // For simplicity, let's just make the modal handle it
                            setUserToAssignExams({ uid: 'multiple', nombreCompleto: 'Múltiples Usuarios' } as any);
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all"
                          title="Asignar exámenes en lote"
                        >
                          <BookOpen size={20} />
                        </button>
                        <button 
                          onClick={() => setIsBulkDeleting(true)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded-xl transition-all"
                          title="Eliminar seleccionados"
                        >
                          <Trash size={20} />
                        </button>
                        <button 
                          onClick={() => setSelectedUsers([])}
                          className="ml-2 text-xs font-bold text-slate-400 hover:text-slate-600"
                        >
                          Cancelar
                        </button>
                      </motion.div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="p-4 w-10">
                              <button 
                                onClick={() => {
                                  if (selectedUsers.length === allUsers.length) {
                                    setSelectedUsers([]);
                                  } else {
                                    setSelectedUsers(allUsers.map(u => u.uid));
                                  }
                                }}
                                className="text-indigo-600 hover:text-indigo-700"
                              >
                                {selectedUsers.length === allUsers.length && allUsers.length > 0 ? (
                                  <CheckSquare size={20} />
                                ) : (
                                  <Square size={20} />
                                )}
                              </button>
                            </th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CURP</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Rol</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Estado Actual</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Exámenes</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {allUsers.length > 0 ? allUsers.map((u) => {
                            const isSelected = selectedUsers.includes(u.uid);
                            return (
                              <tr key={u.uid} className={`transition-colors ${isSelected ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}>
                                <td className="p-4">
                                  <button 
                                    onClick={() => {
                                      setSelectedUsers(prev => 
                                        isSelected ? prev.filter(id => id !== u.uid) : [...prev, u.uid]
                                      );
                                    }}
                                    className={`${isSelected ? 'text-indigo-600' : 'text-slate-300'} hover:text-indigo-500`}
                                  >
                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                  </button>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                      u.rol === 'Admin' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'
                                    }`}>
                                      {u.nombreCompleto?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-700">{u.nombreCompleto}</p>
                                      <p className="text-[10px] text-slate-400">{u.email || 'Sin email'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4 text-sm text-slate-500 font-mono">{u.curp}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                    u.rol === 'Admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {u.rol}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    u.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' : 
                                    u.estado === 'bloqueado' ? 'bg-red-100 text-red-700' : 
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {u.estado || 'pendiente'}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-col gap-1">
                                    {u.rol === 'Alumno' ? (
                                      <>
                                        {u.examenesHabilitados && u.examenesHabilitados.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 w-full mb-0.5">Habilitados</span>
                                            {u.examenesHabilitados.map(exId => {
                                              const exam = examenes.find(e => e.id === exId);
                                              return <span key={exId} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{exam?.titulo || 'Examen'}</span>;
                                            })}
                                          </div>
                                        )}
                                        {u.examenesBloqueados && u.examenesBloqueados.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            <span className="text-[10px] uppercase font-bold text-red-400 w-full mb-0.5">Bloqueados (Trampa)</span>
                                            {u.examenesBloqueados.map(exId => {
                                              const exam = examenes.find(e => e.id === exId);
                                              return (
                                                <div key={exId} className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-lg border border-red-100">
                                                  <span className="text-[10px] font-bold">{exam?.titulo || 'Examen'}</span>
                                                  <button 
                                                    onClick={() => handleUnlockExam(u.uid, exId)}
                                                    className="hover:text-red-800"
                                                    title="Desbloquear Examen"
                                                  >
                                                    <CheckCircle size={10} />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {(!u.examenesHabilitados || u.examenesHabilitados.length === 0) && (!u.examenesBloqueados || u.examenesBloqueados.length === 0) && (
                                          <span className="text-xs text-slate-400 italic">Sin asignaciones</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-slate-400">Acceso total</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {u.rol === 'Alumno' && (
                                      <button 
                                        onClick={() => setViewingUserHistory(u)}
                                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                        title="Ver Historial"
                                      >
                                        <Eye size={16} />
                                      </button>
                                    )}
                                    {u.rol === 'Alumno' && (
                                      <button 
                                        onClick={() => setUserToAssignExams(u)}
                                        className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                                        title="Asignar"
                                      >
                                        <BookOpen size={16} />
                                      </button>
                                    )}
                                    {u.estado !== 'activo' && (
                                      <button 
                                        onClick={() => handleUpdateUserStatus(u.uid, 'activo')}
                                        className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                                        title="Aprobar"
                                      >
                                        <CheckCircle size={16} />
                                      </button>
                                    )}
                                    {u.estado !== 'bloqueado' && u.rol !== 'Admin' && (
                                      <button 
                                        onClick={() => handleUpdateUserStatus(u.uid, 'bloqueado')}
                                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
                                        title="Bloquear"
                                      >
                                        <ShieldCheck size={16} />
                                      </button>
                                    )}
                                    {u.rol !== 'Admin' && (
                                      <button 
                                        onClick={() => setUserToDelete(u)}
                                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all"
                                        title="Eliminar"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={7} className="p-12 text-center text-slate-400 font-medium italic">
                                No hay usuarios registrados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : profile?.rol === 'Admin' && adminTab === 'configuracion' ? (
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden max-w-2xl mx-auto">
                  <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <Settings size={20} className="text-indigo-600" />
                      Configuración de la Plataforma
                    </h3>
                  </div>
                  <div className="p-8">
                    <form onSubmit={handleSaveConfig} className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Nombre de la Plataforma</label>
                        <input 
                          type="text" 
                          value={appConfig?.nombrePlataforma || ''}
                          onChange={(e) => setAppConfig(prev => prev ? { ...prev, nombrePlataforma: e.target.value } : null)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="Ej. EduTest Pro"
                        />
                      </div>

                      <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <label className="block text-sm font-bold text-indigo-900 mb-2 uppercase tracking-wide">⭐ URL de Plantilla de Fondo (Recomendado)</label>
                        <input 
                          type="text" 
                          value={appConfig?.plantillaUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            // Clean URL and transform
                            setAppConfig(prev => prev ? { ...prev, plantillaUrl: transformGoogleDriveUrl(val.trim()) } : null);
                          }}
                          className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                          placeholder="https://drive.google.com/file/d/ID/view"
                        />
                        <p className="mt-2 text-xs text-indigo-600 font-medium">Usa una imagen de fondo (PNG/JPG) para tu certificado. Esto reemplazará los logos automáticos por un diseño profesional.</p>
                        
                        {appConfig?.plantillaUrl && (
                          <div className="mt-4 p-2 bg-white rounded-lg border border-indigo-200 flex flex-col items-center">
                            <p className="text-[10px] uppercase font-bold text-indigo-300 mb-2 tracking-widest">Vista Previa Plantilla</p>
                            <img 
                              src={appConfig.plantillaUrl} 
                              alt="Plantilla preview" 
                              className="max-h-24 w-full object-contain"
                              onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150?text=Error+Enlace+Drive')}
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">URL del Logo (Certificados)</label>
                        <input 
                          type="text" 
                          value={appConfig?.logoUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAppConfig(prev => prev ? { ...prev, logoUrl: transformGoogleDriveUrl(val) } : null);
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="https://ejemplo.com/logo.png"
                        />
                        <p className="mt-2 text-xs text-slate-400">Este logo se ignorará si usas una Plantilla de Fondo arriba.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">URL del Logo Secundario (Esquina Derecha)</label>
                        <input 
                          type="text" 
                          value={appConfig?.secondaryLogoUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAppConfig(prev => prev ? { ...prev, secondaryLogoUrl: transformGoogleDriveUrl(val) } : null);
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="https://ejemplo.com/logo-secundario.png"
                        />
                        <p className="mt-2 text-xs text-slate-400">Este logo se mostrará en la esquina superior derecha del certificado.</p>
                      </div>
                      
                      {appConfig?.secondaryLogoUrl && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">Vista Previa Logo Secundario</p>
                          <img 
                            src={appConfig.secondaryLogoUrl} 
                            alt="Secondary logo preview" 
                            className="max-h-24 object-contain"
                            onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150?text=Error+Logo+2')}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      
                      {appConfig?.logoUrl && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">Vista Previa del Logo</p>
                          <img 
                            src={appConfig.logoUrl} 
                            alt="Logo preview" 
                            className="max-h-24 object-contain"
                            onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150?text=Error+Logo')}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Nombre del Evaluador</label>
                        <input 
                          type="text" 
                          value={appConfig?.nombreEvaluador || ''}
                          onChange={(e) => setAppConfig(prev => prev ? { ...prev, nombreEvaluador: e.target.value } : null)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="Nombre Completo del Evaluador"
                        />
                        <p className="mt-2 text-xs text-slate-400">Este nombre aparecerá impreso debajo de la línea de firma en los certificados.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">URL de la Firma del Evaluador</label>
                        <input 
                          type="text" 
                          value={appConfig?.firmaUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAppConfig(prev => prev ? { ...prev, firmaUrl: transformGoogleDriveUrl(val) } : null);
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="https://ejemplo.com/firma.png"
                        />
                        <p className="mt-2 text-xs text-slate-400">URL de la imagen de la firma (PNG con fondo transparente recomendado).</p>
                      </div>

                      {appConfig?.firmaUrl && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">Vista Previa de la Firma</p>
                          <img 
                            src={appConfig.firmaUrl} 
                            alt="Firma preview" 
                            className="max-h-16 object-contain"
                            onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150?text=Error+Firma')}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Guardar Configuración
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Available Exams */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="text-indigo-600" size={24} />
                      <h2 className="text-xl font-bold text-slate-800">Evaluaciones Disponibles</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {examenes.filter(ex => profile?.rol === 'Admin' || (profile?.examenesHabilitados && profile.examenesHabilitados.includes(ex.id))).length > 0 ? 
                        examenes
                          .filter(ex => profile?.rol === 'Admin' || (profile?.examenesHabilitados && profile.examenesHabilitados.includes(ex.id)))
                          .map((examen) => (
                        <div key={examen.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-indigo-50 p-3 rounded-xl group-hover:bg-indigo-600 transition-colors">
                              <FileText className="text-indigo-600 group-hover:text-white" size={24} />
                            </div>
                            <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                              <Clock size={14} />
                              {examen.tiempoLimite} min
                            </div>
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 mb-2">{examen.titulo}</h3>
                          <p className="text-slate-500 text-sm mb-6 line-clamp-2">{examen.descripcion}</p>
                          
                          <div className="flex gap-2">
                            {profile?.examenesBloqueados?.includes(examen.id) ? (
                              <button 
                                disabled
                                className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl font-bold cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                <XCircle size={18} />
                                BLOQUEADO
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStartExamen(examen)}
                                className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all transform active:scale-95"
                              >
                                Comenzar
                              </button>
                            )}
                            {profile?.rol === 'Admin' && (
                              <>
                                <button 
                                  onClick={() => {
                                    setExamToEdit(examen);
                                    setIsEditingExam(true);
                                  }}
                                  className="p-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                                  title="Editar Examen"
                                >
                                  <FileText size={20} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteExam(examen.id)}
                                  className="p-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 transition-all"
                                  title="Eliminar Examen"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-full bg-slate-100 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                          <p className="text-slate-400 font-medium">
                            {profile?.rol === 'Admin' 
                              ? 'No hay exámenes disponibles en este momento.' 
                              : 'No tienes evaluaciones asignadas. Contacta a tu administrador.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sidebar: Recent History */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <LayoutDashboard className="text-indigo-600" size={24} />
                      <h2 className="text-xl font-bold text-slate-800">Actividad Reciente</h2>
                    </div>
                    
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      {historial.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {historial.map((res) => (
                            <div key={res.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {res.aprobado ? (
                                  <CheckCircle2 className="text-emerald-500" size={20} />
                                ) : (
                                  <XCircle className="text-red-500" size={20} />
                                )}
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{res.examenTitulo}</p>
                                  <p className="text-xs text-slate-400">{new Date(res.fecha).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold ${res.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {res.puntaje}%
                                </p>
                                {res.aprobado && (
                                  <button 
                                    onClick={() => generateCertificate(res, profile!, appConfig?.logoUrl, appConfig?.firmaUrl, appConfig?.secondaryLogoUrl, appConfig?.nombreEvaluador, appConfig?.plantillaUrl)}
                                    className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:underline"
                                  >
                                    Certificado
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <p className="text-sm text-slate-400">Aún no has realizado ninguna evaluación.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* PENDING APPROVAL VIEW */}
          {view === 'pending_approval' && profile && (
            <motion.div 
              key="pending"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md mx-auto mt-12 text-center"
            >
              <div className="bg-white p-10 rounded-3xl shadow-2xl border border-slate-100">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  profile.estado === 'bloqueado' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  {profile.estado === 'bloqueado' ? <XCircle size={40} /> : <Clock size={40} />}
                </div>
                
                <h2 className="text-2xl font-black text-slate-900 mb-4">
                  {profile.estado === 'bloqueado' ? 'Acceso Restringido' : 'Cuenta en Revisión'}
                </h2>
                
                <p className="text-slate-500 mb-8">
                  {profile.estado === 'bloqueado' 
                    ? 'Tu acceso a la plataforma ha sido suspendido por el administrador. Por favor, contacta a soporte si crees que esto es un error.' 
                    : '¡Hola! Tus datos han sido registrados correctamente. Actualmente tu cuenta está esperando la aprobación de un administrador para acceder a las evaluaciones.'}
                </p>

                <div className="p-4 bg-slate-50 rounded-2xl mb-8 text-left">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tus Datos</p>
                  <p className="text-sm font-bold text-slate-700">{profile.nombreCompleto}</p>
                  <p className="text-xs text-slate-500 font-mono">{profile.curp}</p>
                </div>

                <button 
                  onClick={handleLogout}
                  className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-900 transition-all"
                >
                  Cerrar Sesión
                </button>
              </div>
            </motion.div>
          )}

          {/* QUIZ VIEW */}
          {view === 'quiz' && activeExamen && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-5xl mx-auto"
            >
              <QuizComponent 
                examen={activeExamen} 
                onComplete={handleQuizComplete} 
                onExit={() => setView('dashboard')}
                onBloqueo={() => handleBlockExam(activeExamen.id)}
              />
            </motion.div>
          )}

          {/* RESULT VIEW */}
          {view === 'result' && lastResultado && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-2xl mx-auto text-center"
            >
              <div className="bg-white p-12 rounded-3xl shadow-2xl border border-slate-100">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 ${lastResultado.aprobado ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  {lastResultado.aprobado ? <Award size={56} /> : <XCircle size={56} />}
                </div>
                
                <h2 className="text-4xl font-black text-slate-900 mb-2">
                  {lastResultado.aprobado ? '¡Felicidades!' : 'Sigue Intentando'}
                </h2>
                <p className="text-xl text-slate-500 mb-8">
                  Has finalizado la evaluación de <span className="font-bold text-slate-700">{lastResultado.examenTitulo}</span>
                </p>

                <div className="grid grid-cols-2 gap-4 mb-10">
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Calificación</p>
                    <p className={`text-4xl font-black ${lastResultado.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>
                      {lastResultado.puntaje}%
                    </p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Estado</p>
                    <p className={`text-2xl font-black ${lastResultado.aprobado ? 'text-emerald-600' : 'text-red-600'}`}>
                      {lastResultado.aprobado ? 'APROBADO' : 'REPROBADO'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  {lastResultado.aprobado && (
                    <button 
                      onClick={() => generateCertificate(lastResultado, profile!, appConfig?.logoUrl, appConfig?.firmaUrl, appConfig?.secondaryLogoUrl, appConfig?.nombreEvaluador, appConfig?.plantillaUrl)}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 px-6 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                    >
                      <Download size={20} />
                      Descargar Certificado
                    </button>
                  )}
                  <button 
                    onClick={() => setView('dashboard')}
                    className="flex-1 bg-slate-100 text-slate-700 py-4 px-6 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Volver al Panel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 text-center text-slate-400 text-sm">
        <p>© 2026 EduTest Pro. Gustavo Utrilla Inc.</p>
        <p className="mt-1">Plataforma de Evaluación de Cursos.</p>
        <p className="mt-1">Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
