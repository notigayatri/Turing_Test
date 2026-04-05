'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();

  return (
    <main className={styles.main}>
      <div className={styles.logoBox}>
        <Image
          src="/luminus.jpeg"
          alt="Luminus 2026 Logo"
          width={150}
          height={75}
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      <div className={styles.content}>
        <h1 className={`${styles.title} gradient-text`}>Turing Test</h1>

        <p className={styles.description}>
          Can you outsmart AI? Battle across two rounds — detect AI-generated
          multimedia content at speed, then dissect Pull Requests like a detective.
        </p>

        <button
          className={styles.loginBtn}
          onClick={() => router.push('/join')}
        >
          Enter the Event →
        </button>
      </div>
    </main>
  );
}
