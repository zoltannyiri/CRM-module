import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(formData);
      navigate(location.state?.from || "/", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#f4f5f1] text-[#1c2927] min-[761px]:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.1fr)]">
      <section className="flex min-h-[310px] flex-col justify-between bg-[#163b36] bg-[linear-gradient(145deg,rgba(211,232,193,0.12),transparent_48%),repeating-linear-gradient(90deg,transparent_0_47px,rgba(255,255,255,.035)_48px)] p-6 text-[#f4f5f1] min-[761px]:min-h-screen min-[761px]:px-[clamp(28px,5vw,84px)] min-[761px]:py-9">
        <div className="flex items-center gap-[11px] text-[15px] font-bold tracking-[.02em]"><span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-[#d3e8c1] font-extrabold text-[#163b36]">N</span><span>Northstar CRM</span></div>
        <div className="my-[42px] max-w-[470px] min-[761px]:my-auto">
          <p className="mb-[14px] text-[11px] font-extrabold uppercase tracking-[.14em] text-[#b2cdb0]">Ügyfélkapcsolatok, egy helyen</p>
          <h1 className="m-0 text-[42px] font-medium leading-[.98] tracking-normal text-[#f4f5f1] min-[761px]:text-[clamp(38px,5vw,68px)]">Lásd, mi számít. Tedd meg a következő lépést.</h1>
          <p className="mt-[26px] max-w-[340px] text-base text-[#b7cac2]">A csapatod munkája, ügyfelei és lehetőségei egy nyugodtabb munkatérben.</p>
        </div>
        <div className="text-[13px] text-[#b7cac2]"><span className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#b9d979]" /> A csapatod munkaterülete készen áll</div>
      </section>

      <section className="mx-auto w-[calc(100%-40px)] max-w-[500px] self-center py-[42px] min-[761px]:my-12 min-[761px]:w-[calc(100%-56px)]">
        <div className="mb-[34px]">
          <p className="mb-[14px] text-[11px] font-extrabold uppercase tracking-[.14em] text-[#809a91]">Üdv újra</p>
          <h2 className="m-0 text-[32px] font-medium leading-tight tracking-normal text-[#1c2927] min-[431px]:text-[38px]">Jelentkezz be a fiókodba</h2>
          <p className="mt-4 max-w-[410px] text-[15px] text-[#697873]">Folytasd ott, ahol abbahagytad. A munkaterületed vár.</p>
        </div>

        <form className="grid gap-[19px]" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Email cím<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)]" type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" /></label>
          <label className="grid gap-2 text-xs font-extrabold tracking-[.02em] text-[#52625d]">Jelszó<input className="box-border w-full rounded-[7px] border border-[#d8dfda] bg-white px-[15px] py-[14px] text-[15px] font-normal text-[#1c2927] outline-none focus:border-[#39766a] focus:shadow-[0_0_0_3px_rgba(57,118,106,.12)]" type="password" name="password" value={formData.password} onChange={handleChange} required autoComplete="current-password" /></label>
          {error && <p className="-mt-0.5 rounded-md bg-[#fcece7] px-[13px] py-[11px] text-[13px] text-[#9d3d2e]" role="alert">{error}</p>}
          <button className="mt-1 flex items-center justify-between rounded-[7px] border-0 bg-[#1c2927] px-[17px] py-4 text-sm font-extrabold text-[#f8faf7] transition hover:bg-[#39766a] disabled:cursor-wait disabled:opacity-65" type="submit" disabled={submitting}>{submitting ? "Bejelentkezés..." : "Belépés a munkaterületre"}<span aria-hidden="true">→</span></button>
        </form>
        <p className="mt-[25px] text-center text-[13px] text-[#77847f]">Meghívót kaptál? <span className="text-[#52625d]">Nyisd meg a kapott regisztrációs linket.</span></p>
        <p className="mt-3 text-center text-[13px] text-[#77847f]"><Link className="font-extrabold text-[#39766a] no-underline" to="/">Vissza a kezdőlapra</Link></p>
      </section>
    </main>
  );
};

export default LoginPage;
