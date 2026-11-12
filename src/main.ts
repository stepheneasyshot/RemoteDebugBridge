import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

const button = document.querySelector<HTMLButtonElement>("#greet")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;

button.addEventListener("click", async () => {
  try {
    message.textContent = await invoke<string>("greet", { name: "Remote Debug Bridge" });
  } catch (error) {
    message.textContent = `调用失败：${String(error)}`;
  }
});
