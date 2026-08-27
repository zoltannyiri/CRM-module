import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { authApi } from "../api/client.js";
import { useAuth } from "../hooks/useAuth.js";

const RegisterPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authApi.invitation(token)
      .then((result) => {
        setInvitation(result);
        setFormData((current) => ({ ...current, email: result.email || "" }));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await register(token, formData);
      navigate("/");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f5f1] text-[#1c2927]"><div className="text-sm text-[#697873]">Meghívó ellenőrzése...</div></main>;
  }

  if (!invitation) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f5f1] px-6 text-[#1c2927]">
        <div className="w-full max-w-[420px] rounded-[10px] border border-[#d8dfda] bg-white p-10 text-center">
          <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-[#d3e8c1] font-extrabold text-[#163b36]">N</span>
          <h1 className="mt-[22px] mb-2 text-[32px] font-medium leading-tight">Ez a meghívó már nem érvényes</h1>
          <p className="mb-6 text-[15px] text-[#697873]">{error || "Kérj új meghívót a munkaterület adminisztrátorától."}</p>
          <Link className="font-extrabold text-[#39766a] no-underline" to="/login">Vissza a bejelentkezéshez</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#f4f5f1] text-[#1c2927] min-[761px]:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.1fr)]">
      <section className="flex min-h-[310px] flex-col justify-between bg-[#163b36] bg-[linear-gradient(145deg,rgba(211,232,193,0.12),transparent_48%),repeating-linear-gradient(90deg,transparent_0_47px,rgba(255,255,255,.035)_48px)] p-6 text-[#f4f5f1] min-[761px]:min-h-screen min-[761px]:px-[clamp(28px,5vw,84px)] min-[761px]:py-9">
        <div className="flex items-center gap-[11px] text-[15px] font-bold tracking-[.02em]"><span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-[#d3e8c1] font-extrabold text-[#163b36]">N</span><span>Northstar CRM</span></div>
        <div className="my-[42px] max-w-[470px] min-[761px]:my-auto">
          <p className="mb-[14px] text-[11px] font-extrabold uppercase tracking-[.14em] text-[#b2cdb0]">Munkaterület meghívó</p>
          <h1 className="m-0 text-[42px] font-medium leading-[.98] tracking-normal text-[#f4f5f1] min-[761px]:text-[clamp(38px,5vw,68px)]">Dolgozzatok tisztábban. Zárjatok gyorsabban.</h1>
          <p className="mt-[26px] max-w-[340px] text-base text-[#b7cac2]">Egyetlen hely az ügyfeleknek, lehetőségeknek és a csapat következő lépéseinek.</p>
        </div>
        <div className="text-[13px] text-[#b7cac2]"><span className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#b9d979]" /> Meghívva ide: {invitation.organization.name}</div>
      </section>
      <section className="mx-auto w-[calc(100%-40px)] max-w-[500px] self-center py-[42px] min-[761px]:my-12 min-[761px]:w-[calc(100%-56px)]">
        <div className="flex items-start justify-between gap-5"><div><p className="mb-[14px] text-[11px] font-extrabold uppercase tracking-[.14em] text-[#809a91]">Első lépés</p><h2 className="m-0 text-[32px] font-medium leading-tight tracking-normal text-[#1c2927] min-[431px]:text-[38px]">Hozd létre a fiókod</h2></div><span className="text-xs font-extrabold tracking-[.08em] text-[#91a09b]">01 / 01</span></div>
        <p className="my-4 mb-[34px] max-w-[410px] text-[15px] text-[#697873]">Töltsd ki az adatokat, és máris csatlakozol a csapatod munkaterületéhez.</p>
        <form className="grid gap-[19px]" onSubmit={handleSubmit}>
          <div className="grid gap-[19px] min-[431px]:grid-cols-2 min-[431px]:gap-[14px]">
            <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Vezetéknév<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)]" name="lastName" value={formData.lastName} onChange={handleChange} required autoComplete="family-name" /></label>
            <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Keresztnév<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)]" name="firstName" value={formData.firstName} onChange={handleChange} required autoComplete="given-name" /></label>
          </div>
          <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Email cím<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)] read-only:bg-[#e9eeea] read-only:text-[#6a7772]" type="email" name="email" value={formData.email} onChange={handleChange} required readOnly={Boolean(invitation.email)} autoComplete="email" /></label>
          <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Jelszó<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)]" type="password" name="password" value={formData.password} onChange={handleChange} minLength="8" required autoComplete="new-password" /><span className="-mt-0.5 text-[11px] font-normal text-[#82908b]">Legalább 8 karakter</span></label>
          {error && <p className="-mt-0.5 rounded-md bg-[#fcece7] px-[13px] py-[11px] text-[13px] text-[#9d3d2e]" role="alert">{error}</p>}
          <button className="mt-1 flex items-center justify-between rounded-[7px] border-0 bg-[#1c2927] px-[17px] py-4 text-sm font-extrabold text-[#f8faf7] transition hover:bg-[#39766a] disabled:cursor-wait disabled:opacity-65" type="submit" disabled={submitting}>{submitting ? "Fiók létrehozása..." : "Csatlakozás a munkaterülethez"}<span aria-hidden="true">→</span></button>
        </form>
        <p className="mt-[25px] text-center text-[13px] text-[#77847f]">Már van fiókod? <Link className="font-extrabold text-[#39766a] no-underline" to="/login">Bejelentkezés</Link></p>
      </section>
    </main>
  );
};

export default RegisterPage;