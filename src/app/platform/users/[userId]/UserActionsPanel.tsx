"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Power, Trash2, Lock, X, Link2, Copy, Check } from "lucide-react";
import { Button, Input, ConfirmDialog, Toast } from "@/components/ui";
import {
  updateUserName,
  updateUserEmail,
  updateUserPassword,
  sendPasswordRecovery,
  generatePasswordRecoveryLink,
  setUserBanned,
} from "./actions";

interface UserActionsPanelProps {
  userId: string;
  initialName: string;
  initialEmail: string;
  initialBanned: boolean;
  isSelf: boolean;
}

// Small standalone modal for the password form — same backdrop/panel
// language as ConfirmDialog, but with fields instead of a message.
function PasswordModal({
  onClose,
  onSubmit,
  pending,
  serverError,
}: {
  onClose: () => void;
  onSubmit: (password: string, confirmPassword: string) => void;
  pending: boolean;
  serverError: string | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const displayedError = localError ?? serverError;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 6) {
      setLocalError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Las contraseñas no coinciden.");
      return;
    }
    onSubmit(password, confirmPassword);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto w-full md:w-[420px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Cambiar contraseña</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-muted hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Input
              label="Nueva contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            {displayedError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {displayedError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 pb-5">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Guardar contraseña
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

// Modal de solo lectura para el enlace de recuperación generado — nunca se
// persiste (ni aquí ni en el servidor, ver generatePasswordRecoveryLink):
// vive únicamente en el estado de UserActionsPanel mientras el modal está
// abierto, y se descarta al cerrarlo. Nunca envía nada por sí mismo — el
// equipo de soporte lo comparte manualmente (WhatsApp, etc.) con "Copiar
// enlace".
function RecoveryLinkModal({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Enlace de recuperación</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-muted hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-brand-muted">
              Compártelo manualmente con el usuario (por ejemplo, por WhatsApp). Nunca se envía por
              correo automáticamente.
            </p>

            <div className="text-xs text-white bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 break-all select-all">
              {link}
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 pb-5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="button" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function UserActionsPanel({
  userId,
  initialName,
  initialEmail,
  initialBanned,
  isSelf,
}: UserActionsPanelProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [banned, setBanned] = useState(initialBanned);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);
  const [banError, setBanError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [confirmBanOpen, setConfirmBanOpen] = useState(false);
  // Nunca persistido — solo vive aquí mientras el modal está abierto (ver
  // RecoveryLinkModal y generatePasswordRecoveryLink).
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  const [savingName, startSavingName] = useTransition();
  const [savingEmail, startSavingEmail] = useTransition();
  const [savingPassword, startSavingPassword] = useTransition();
  const [sendingRecovery, startSendingRecovery] = useTransition();
  const [generatingRecoveryLink, startGeneratingRecoveryLink] = useTransition();
  const [togglingBan, startTogglingBan] = useTransition();

  function handleSaveName() {
    setNameError(null);
    startSavingName(async () => {
      const result = await updateUserName(userId, name);
      if (result.error) {
        setNameError(result.error);
        return;
      }
      setToastMessage("Nombre actualizado correctamente");
      router.refresh();
    });
  }

  function handleSaveEmail() {
    setEmailError(null);
    startSavingEmail(async () => {
      const result = await updateUserEmail(userId, email);
      if (result.error) {
        setEmailError(result.error);
        return;
      }
      setToastMessage("Correo actualizado correctamente");
      router.refresh();
    });
  }

  function handleSavePassword(password: string, confirmPassword: string) {
    setPasswordError(null);
    startSavingPassword(async () => {
      const result = await updateUserPassword(userId, password, confirmPassword);
      if (result.error) {
        setPasswordError(result.error);
        return;
      }
      setPasswordModalOpen(false);
      setToastMessage("Contraseña actualizada correctamente");
    });
  }

  function handleSendRecovery() {
    setRecoveryError(null);
    startSendingRecovery(async () => {
      const result = await sendPasswordRecovery(email);
      if (result.error) {
        setRecoveryError(result.error);
        return;
      }
      setToastMessage("Correo de recuperación enviado");
    });
  }

  function handleGenerateRecoveryLink() {
    setRecoveryLinkError(null);
    startGeneratingRecoveryLink(async () => {
      const result = await generatePasswordRecoveryLink(email);
      if (result.error) {
        setRecoveryLinkError(result.error);
        return;
      }
      setRecoveryLink(result.link ?? null);
    });
  }

  function handleConfirmBanToggle() {
    setBanError(null);
    const next = !banned;
    startTogglingBan(async () => {
      const result = await setUserBanned(userId, next);
      setConfirmBanOpen(false);
      if (result.error) {
        setBanError(result.error);
        return;
      }
      setBanned(next);
      setToastMessage(next ? "Usuario suspendido" : "Usuario reactivado");
      router.refresh();
    });
  }

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
        Acciones
      </h2>

      <div className="flex flex-col gap-6">
        {/* Cambiar nombre */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <Input
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError ?? undefined}
            />
          </div>
          <Button variant="secondary" loading={savingName} onClick={handleSaveName}>
            Guardar nombre
          </Button>
        </div>

        {/* Cambiar correo */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError ?? undefined}
            />
          </div>
          <Button variant="secondary" loading={savingEmail} onClick={handleSaveEmail}>
            <Mail className="w-4 h-4" />
            Guardar correo
          </Button>
        </div>

        <div className="h-px bg-white/10" />

        {/* Contraseña + recuperación */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setPasswordError(null);
              setPasswordModalOpen(true);
            }}
          >
            <KeyRound className="w-4 h-4" />
            Cambiar contraseña
          </Button>
          <Button variant="secondary" loading={sendingRecovery} onClick={handleSendRecovery}>
            <Mail className="w-4 h-4" />
            Enviar recuperación
          </Button>
          <Button
            variant="secondary"
            loading={generatingRecoveryLink}
            onClick={handleGenerateRecoveryLink}
          >
            <Link2 className="w-4 h-4" />
            Generar enlace de recuperación
          </Button>
        </div>
        {recoveryError && <p className="text-xs text-amber-300">{recoveryError}</p>}
        {recoveryLinkError && <p className="text-xs text-amber-300">{recoveryLinkError}</p>}

        <div className="h-px bg-white/10" />

        {/* Activar / Desactivar */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              variant={banned ? "success" : "danger"}
              disabled={isSelf}
              onClick={() => setConfirmBanOpen(true)}
            >
              <Power className="w-4 h-4" />
              {banned ? "Activar usuario" : "Desactivar usuario"}
            </Button>
            <span className="text-sm text-brand-muted">
              Estado actual: <span className={banned ? "text-red-400" : "text-emerald-400"}>
                {banned ? "Suspendido" : "Activo"}
              </span>
            </span>
          </div>
          {isSelf && (
            <p className="text-xs text-brand-muted mt-2">
              No puedes suspender tu propia cuenta de Platform Admin.
            </p>
          )}
          {banError && <p className="text-xs text-red-400 mt-2">{banError}</p>}
        </div>

        <div className="h-px bg-white/10" />

        {/* Eliminar usuario — deshabilitado por ahora */}
        <div>
          <Button variant="danger" disabled className="justify-between">
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Eliminar usuario
            </span>
            <span className="text-[10px] font-medium bg-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1 ml-2">
              <Lock className="w-2.5 h-2.5" />
              Próximamente
            </span>
          </Button>
        </div>
      </div>

      {passwordModalOpen && (
        <PasswordModal
          onClose={() => setPasswordModalOpen(false)}
          onSubmit={handleSavePassword}
          pending={savingPassword}
          serverError={passwordError}
        />
      )}

      {recoveryLink && (
        <RecoveryLinkModal link={recoveryLink} onClose={() => setRecoveryLink(null)} />
      )}

      <ConfirmDialog
        open={confirmBanOpen}
        title={banned ? "Activar usuario" : "Desactivar usuario"}
        message={
          banned
            ? "El usuario podrá volver a iniciar sesión en MiPadelClub."
            : "El usuario no podrá iniciar sesión hasta que se reactive su cuenta. No se elimina ningún dato."
        }
        confirmLabel={banned ? "Activar" : "Desactivar"}
        confirmVariant={banned ? "success" : "danger"}
        loading={togglingBan}
        onConfirm={handleConfirmBanToggle}
        onCancel={() => setConfirmBanOpen(false)}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
