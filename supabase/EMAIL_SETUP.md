# Configuración de Correos — PadelClub

Instrucciones para aplicar los templates de correo personalizados en el proyecto Supabase.

Panel del proyecto: https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf

---

## 1. Nombre del remitente

Ir a: **Authentication → Settings → SMTP Settings**

Configurar:
- **Sender name**: `PadelClub`
- **Sender email**: `noreply@padelclub.app` (o la dirección configurada)

> Esto elimina "Supabase Auth" como remitente visible.

---

## 2. Email Templates

Ir a: **Authentication → Email Templates**

https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/auth/templates

Hay 4 templates. Aplicar los cambios para cada uno:

---

### Confirm Signup

**Subject:**
```
Confirma tu cuenta de PadelClub
```

**Body (HTML):**
Copiar y pegar el contenido completo de:
`supabase/email-templates/confirm-signup.html`

**Comportamiento del template:**
- Si el usuario se registró via invitación, muestra el nombre del club y rol invitado
  (requiere que el registro incluya `invite_club_name` en user metadata — ya implementado en SignupForm)
- Si se registró directo, muestra el mensaje genérico de bienvenida a PadelClub

---

### Reset Password

**Subject:**
```
Restablece tu contraseña de PadelClub
```

**Body (HTML):**
Copiar y pegar el contenido completo de:
`supabase/email-templates/reset-password.html`

---

### Magic Link

**Subject:**
```
Accede a tu cuenta de PadelClub
```

**Body (HTML):**
Copiar y pegar el contenido completo de:
`supabase/email-templates/magic-link.html`

---

### Change Email Address

Actualmente no implementado. Usar el template predeterminado o traducir en el dashboard:

**Subject:**
```
Confirma tu nuevo correo — PadelClub
```

---

## 3. Variables disponibles en los templates

Supabase usa Go templates (`text/template`). Variables disponibles:

| Variable | Descripción |
|---|---|
| `{{ .ConfirmationURL }}` | URL de confirmación/acción principal |
| `{{ .Email }}` | Correo del usuario |
| `{{ .SiteURL }}` | URL configurada en Auth Settings |
| `{{ .Token }}` | Token OTP (solo si se usa OTP flow) |
| `{{ index .Data "key" }}` | Campos del user metadata |

### Metadata de invite (inyectado por SignupForm)

Cuando un usuario se registra via link de invitación:

| Campo | Valor ejemplo |
|---|---|
| `{{ index .Data "full_name" }}` | `Ana García` |
| `{{ index .Data "invite_club_name" }}` | `Alex Club Padel` |
| `{{ index .Data "invite_role" }}` | `administrador` |

Uso en template:
```html
{{ if index .Data "invite_club_name" }}
  <p>Has sido invitado a {{ index .Data "invite_club_name" }}.</p>
{{ else }}
  <p>Bienvenido a PadelClub.</p>
{{ end }}
```

---

## 4. Branding del template

Los templates usan los colores oficiales de PadelClub:

| Variable | Valor |
|---|---|
| Primary (lime) | `#B7E000` |
| Secondary (teal) | `#1698BE` |
| Background | `#001A24` |
| Surface | `#082735` |
| Muted text | `#94A3B8` |

---

## 5. Verificar

Después de aplicar los templates:

1. Crear una cuenta nueva en `/auth/signup`
2. Verificar que el correo recibido:
   - Tiene asunto en español
   - Muestra el logo PadelClub
   - NO menciona "Supabase Auth"
   - El botón funciona correctamente

Para probar el template de invite:
1. Ir a `/{club}/admin/team`
2. Crear una invitación de administrador
3. Usar el botón **Dev** (visible solo en desarrollo) para abrir el link directamente
4. Registrar una cuenta nueva via el link de invitación
5. Verificar que el correo muestra el nombre del club y el rol

---

## 6. Custom SMTP (futuro)

Para mayor control sobre el envío (custom domain, analytics, deliverability):

1. Contratar un proveedor SMTP transaccional: Resend, SendGrid, Postmark
2. Configurar en **Authentication → Settings → SMTP Settings**:
   - SMTP Host
   - SMTP Port
   - SMTP User
   - SMTP Pass
   - Sender email con dominio propio

Esto permite también configurar SPF/DKIM para mejor deliverability.
