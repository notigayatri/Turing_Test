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
          Step into the role of a PR Detective. Analyze code reviews, identify the
          true authors (Human or AI), and prove your intuition in this competitive event.
        </p>

        <button
          className={styles.loginBtn}
          onClick={() => router.push('/join')}
        >
          Login to start
        </button>
      </div>
    </main>
  );
}
