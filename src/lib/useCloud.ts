"use client";

import { useEffect, useState } from "react";
import { cloudSnapshot, subscribeCloud } from "./repo";

/** Who is signed in and whether the cloud is reachable, kept current. */
export function useCloudState() {
  const [state, setState] = useState(cloudSnapshot);
  useEffect(() => subscribeCloud(() => setState(cloudSnapshot())), []);
  return state;
}
