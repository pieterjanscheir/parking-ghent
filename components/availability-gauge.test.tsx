// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AvailabilityGauge } from "./availability-gauge";

describe("AvailabilityGauge", () => {
  afterEach(cleanup);

  it.each([
    [42.4, "42%"],
    [-12, "0%"],
    [140, "100%"],
  ])("renders %d as %s", (percent, label) => {
    render(<AvailabilityGauge percent={percent} bucket="available" />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("hides the label when asked", () => {
    const { container } = render(
      <AvailabilityGauge percent={50} bucket="full" showLabel={false} />,
    );
    expect(container.textContent).toBe("");
  });
});
