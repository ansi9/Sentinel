"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAtom } from "jotai";
import { auditEntriesAtom } from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { AuditLedgerView } from "@/client/components/audit/AuditLedgerView";

export default function AuditPage() {
  const [auditEntries, setAuditEntries] = useAtom(auditEntriesAtom);
  const [chainDigest, setChainDigest] = useState<string | undefined>(undefined);
  const [isChainValid, setIsChainValid] = useState<boolean | null>(null);
  const [verificationErrors, setVerificationErrors] = useState<string[]>([]);

  const loadAuditData = useCallback(async () => {
    try {
      const res = await fetch("/api/audit/entries?limit=100");
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries || []);
        setChainDigest(data.chain_digest);
        setIsChainValid(data.is_chain_valid);
        setVerificationErrors(data.verification_errors || []);
      }
    } catch (err) {
      console.warn("Could not fetch real audit ledger entries:", err);
    }
  }, [setAuditEntries]);

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) loadAuditData();
    });
    return () => {
      isMounted = false;
    };
  }, [loadAuditData]);

  return (
    <WorkspaceShell
      title="Audit Integrity"
      activeNav="audit"
      searchPlaceholder="Search logs by TxID, Actor, or Event..."
      shortcutKey="/"
    >
      <AuditLedgerView
        entries={auditEntries}
        chainDigest={chainDigest}
        isChainValid={isChainValid}
        verificationErrors={verificationErrors}
        onRefresh={loadAuditData}
      />
    </WorkspaceShell>
  );
}
