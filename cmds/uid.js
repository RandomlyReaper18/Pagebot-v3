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
   
      const res = await axios.get(`https://kaiz-apis.gleeze.com/api/fbuid?url=${profileURL}&apikey=f05ad551-e7d7-459b-8b27-54e76da15011`);

   
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
