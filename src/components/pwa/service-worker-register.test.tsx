import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registerServiceWorker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pwa/register", () => ({ registerServiceWorker }));

import { ServiceWorkerRegister } from "./service-worker-register";

describe("ServiceWorkerRegister", () => {
  beforeEach(() => registerServiceWorker.mockClear());

  it("chama o registro ao montar e não renderiza nada", () => {
    const { container } = render(<ServiceWorkerRegister />);
    expect(registerServiceWorker).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});
