const axios = require("axios");
const { sendMessage } = require("../handles/message"); // Correctly import sendMessage

module.exports = {
  name: "black",
  description: "BlackBox AI",
  role: 1,
  author: "Prince Sanel",
  async execute(senderId, args, pageAccessToken) {
    const text = args.join(" ");
    if (!text) {
      await sendMessage(senderId, {
        text: `Please Provide a Question.`
      }, pageAccessToken);
      return;
    }
    try {
      if (!process.env.KAIZ_API_KEY) {
        await sendMessage(senderId, { text: "This command is not configured on this server." }, pageAccessToken);
        return;
      }
      const res = await axios.get("https://kaiz-apis.gleeze.com/api/blackbox", {
        params: { ask: text, apikey: process.env.KAIZ_API_KEY, uid: senderId },
        timeout: 30000
      });
      const { response } = res.data;

      if (response) {
        await sendMessage(senderId, {
          text: response
        }, pageAccessToken);
      } else {
        throw new Error("There's an error with Api");
      }
    } catch (error) {
      console.error("Error:", error);
      await sendMessage(senderId, {
        text: `there's an error.`
      }, pageAccessToken);
    }
  }
};
