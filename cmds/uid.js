const axios = require("axios");
const { sendMessage } = require("../handles/message"); // Correctly import sendMessage

module.exports = {
  name: "uid",
  description: "Find Facebook ID using a profile link",
  role: 1,
  author: "Clarence",

  async execute(senderId, args, pageAccessToken) {
    const profileUrl = args.join(" ");

    if (!profileUrl) {
      await sendMessage(senderId, {
        text: `Usage: findid [Facebook profile URL]`
      }, pageAccessToken);
      return;
    }

    try {
   
      if (!process.env.KAIZ_API_KEY) {
        await sendMessage(senderId, { text: "This command is not configured on this server." }, pageAccessToken);
        return;
      }
      const res = await axios.get("https://kaiz-apis.gleeze.com/api/fbuid", {
        params: { url: profileUrl, apikey: process.env.KAIZ_API_KEY },
        timeout: 30000
      });

   
      const { UID } = res.data;

      if (UID) {

        await sendMessage(senderId, {
          text: `🔍 Facebook ID: ${UID}`
        }, pageAccessToken);
      } else {
        throw new Error("Unable to retrieve Facebook ID");
      }
    } catch (error) {
      console.error("Error retrieving Facebook ID:", error);
      await sendMessage(senderId, {
        text: `Error retrieving Facebook ID. Please try again or check your input.`
      }, pageAccessToken);
    }
  }
};
