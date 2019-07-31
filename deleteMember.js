const { db } = require("./index");
async function deleteMember(current_user_email, delete_user_email) {
  let result = await db.collection('users').doc(current_user_email).collection('friends').doc(delete_user_email).delete();
  return result;
}
exports.deleteMember = deleteMember;
