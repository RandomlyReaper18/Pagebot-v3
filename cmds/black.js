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
      const res = await axios.get(`https://kaiz-apis.gleeze.com/api/blackbox?ask=${encodeURIComponent(text)}&apikey=f05ad551-e7d7-459b-8b27-54e76da15011&uid=100088309851834`);
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
