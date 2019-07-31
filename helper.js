const admin = require("firebase-admin");
const update_helper = require('./update')
class Database {
  constructor(db) {
    this.db = admin.firestore();
  }


  async getIndividualStatus(email)
  {
    let status_first = await this.db.collection('posts').where('author','==',email).orderBy('time','desc') .limit(1) .get()
    return status_first.docs[0];
  }


  async getUserDocs(email)
  {
    return await this.db.collection('users').doc(email).get();
  }
  async updateSessionEntities(agent,current_user_email)
  {
    let current_user_family = await this.getFamilyList(current_user_email);
    let promise_array = []
    current_user_family.forEach(member=>{
      console.log(member.id)
      let member_p = this.getUserDocs(member.data().email)
      promise_array.push(member_p)
    })

    let family_list_docs = await Promise.all(promise_array)
    let entries = [];
  
    family_list_docs.forEach(member=>{
      let doc = member.data()
      
      entries.push({
        'value': doc.email,
        'synonyms': [doc.username,doc.given_name],
      })
    })
    console.log('stringify          f','=>',JSON.stringify(entries))

    update_helper.updateSessionEntity(agent,'FamilyName',entries)
    



  }

  async constructFeed(current_user_email) {
    let current_user_family = await this.getFamilyList(current_user_email);

    let lastFeedFetch = await this.getLastFeedFetch(current_user_email);
    let added_posts_promise = [];
    if (!lastFeedFetch.exists) {
      // last fetch time is not available, probably this is first ever fetch by the user
      if (current_user_family.empty) {
        return null;
      }
      current_user_family.forEach(member => {
        let promise = this.getPostsAndAddToFeed(
          current_user_email,
          member.data().email
        );
        added_posts_promise.push(promise);
      });
    } else {
      // fetch with filter, time
      if (current_user_family.empty) {
        return null;
      }
      current_user_family.forEach(member => {
        let promise = this.getPostsAndAddToFeedWithFilterTime(
          current_user_email,
          member.data().email,
          lastFeedFetch.data().last_fetch_time
        );
        added_posts_promise.push(promise);
      });
    }

    let result = await Promise.all(added_posts_promise);
    // update the recent fetch time, no avoid retrieving duplicate items
    let update = await this.updateLastFetchTime(current_user_email);
    return result;
  }

  async registerUser(user) {
    let setUser = await this.db
      .collection("users")
      .doc(user.email)
      .set(user);
  }

  async getPostWithDocumentId(doc_id) {
    return await this.db
      .collection("posts")
      .doc(doc_id)
      .get();
  }

  async getFirstFeedPost(email) {

    let post = await this.db
      .collection("users")
      .doc(email)
      .collection("feed")
      .where("read", "==", false)
      .limit(1)
      .get();

    if (post.empty) {
      return null;
    } else {
      return post.docs[0];
    }
  }

  async getAlreadyReadFirstFeedPost(email) {
    //this will probably result in error, checkout saving date as TimeStamp instead of Date
    let post = await this.db
      .collection("users")
      .doc(email)
      .collection("feed")
      .where("read", "==", true)
      .limit(1)
      .get();

    if (post.empty) {
      return null;
    } else {
      return post.docs[0];
    }
  }

  async getFeedPostWithIndex(email, document_id) {
    let previous_document = await this.db
      .collection(`users/${email}/feed`)
      .doc(document_id)
      .get();
    let post = await this.db
      .collection("users")
      .doc(email)
      .collection("feed")
      .where("read", "==", false)
      .startAfter(previous_document)
      .limit(1)
      .get();

    if (post.empty) {
      return null;
    } else {
      return post.docs[0];
    }
  }

  async getALreadyReadFeedPostWithIndex(email, document_id) {
    let previous_document = await this.db
      .collection(`users/${email}/feed`)
      .doc(document_id)
      .get();
    let post = await this.db
      .collection("users")
      .doc(email)
      .collection("feed")
      .where("read", "==", true)
      .startAfter(previous_document)
      .limit(1)
      .get();

    if (post.empty) {
      return null;
    } else {
      return post.docs[0];
    }
  }

  async updatePostToRead(email, document_id) {
    //this will probably result in error, checkout saving date as TimeStamp instead of Date
    let post = await this.db
      .collection("users")
      .doc(email)
      .collection("feed")
      .doc(document_id)
      .update({
        read: true
      });
  }

  async getPostsFilterWithTime(email, time) {
    //this will probably result in error, checkout saving date as TimeStamp instead of Date
    let posts = await this.db
      .collection("posts")
      .where("author", "==", email)
      .where("time", ">", time)
      .get();
    return posts;
  }

  async getPosts(email) {
    let posts = await this.db
      .collection("posts")
      .where("author", "==", email)
      .get();
    return posts;
  }

  async addToFeed(user_feed_email, post_id) {
    let add = await this.db
      .collection("users")
      .doc(user_feed_email)
      .collection("feed")
      .doc()
      .set({
        postid: post_id,
        read: false
      });
    return add;
  }

  async getPostsAndAddToFeed(current_user_email, family_member_email) {
    let posts = await this.getPosts(family_member_email);
    let added_posts = [];

    if (posts.empty) {
      return added_posts;
    }

    let add_post_promises = [];
    posts.forEach(post => {
      let addpost = this.addToFeed(current_user_email, post.id);
      add_post_promises.push(addpost);
    });

    return await Promise.all(add_post_promises);
  }

  async getPostsAndAddToFeedWithFilterTime(
    current_user_email,
    family_member_email,
    time
  ) {
    // let date = admin.firestore.serverTimestamp()
    //let date = admin.firestore.Timestamp.fromDate(new Date())
    let posts = await this.getPostsFilterWithTime(family_member_email, time);
    let added_posts = [];

    if (posts.empty) {
      return added_posts;
    }

    let add_post_promises = [];
    posts.forEach(post => {
      let addpost = this.addToFeed(current_user_email, post.id);
      add_post_promises.push(addpost);
    });

    return await Promise.all(add_post_promises);
  }

  async updateLastFetchTime(user) {
    //  let date = admin.firestore.FieldValue.serverTimestamp()
    let date = admin.firestore.Timestamp.fromDate(new Date());
    return await this.db
      .collection("users")
      .doc(user)
      .collection("feed")
      .doc("last_fetch")
      .set({
        last_fetch_time: date
      });
  }

  async getLastFeedFetch(current_user_email) {
    let lastfetch = await this.db
      .collection("users")
      .doc(current_user_email)
      .collection("feed")
      .doc("last_fetch")
      .get();
    return lastfetch;
  }

  async removeFromReqList(current_user_email, family_member_email) {
    let add_member = await this.db
      .collection("users")
      .doc(current_user_email)
      .collection("requests")
      .doc(family_member_email)
      .delete();
    if (!add_member) {
      return false;
    } else {
      return true;
    }
  }

  async addToFamilyList(current_user_email, family_member_email) {
    let add_member = await this.db
      .collection("users")
      .doc(current_user_email)
      .collection("family")
      .doc(family_member_email)
      .set({
        email: family_member_email
      });

    if (!add_member) {
      return false;
    } else {
      return true;
    }
  }

  async checkifFamilyRequests(email) {
    //let email = getUserInfo().email
    let result_str = "";
    let names = "";

    try {
      let result = await this.db
        .collection("users")
        .doc(email)
        .collection("requests")
        .get();
      return result;
    } catch (error) {
      return "Error, Trouble Getting the Request List";
    }
  }

  async checkIfValidUser(email) {
    let userRef = await this.db
      .collection("users")
      .doc(email)
      .get()
      if(userRef.exists){
        return true;
      }
      else{return false}
  }

  async sendFamilyRequest(email, currentUser) {
    let date = admin.firestore.FieldValue.serverTimestamp();
    let reqRef = await this.db
      .collection("users")
      .doc(email)
      .collection("requests")
      .doc(currentUser.email)
      .set({
        email: currentUser.email,
        name: currentUser.name,
        date: date
      });
  }

  async addNewStatus(author, name, status) {
    //let date = admin.firestore.FieldValue.serverTimestamp()
    let date = admin.firestore.Timestamp.fromDate(new Date());
    let setDoc = await this.db
      .collection("posts")
      .doc()
      .set({
        author: author,
        name: name,
        status: status,
        time: date
      });
    return setDoc;
  }

  async getFamilyList(email) {
    let family_list = await this.db
      .collection("users")
      .doc(email)
      .collection("family")
      .get();
    return family_list;
  }

  async deleteMember_db(current_user_email, delete_user_email) {
    let result = await this.db
      .collection("users")
      .doc(current_user_email)
      .collection("family")
      .doc(delete_user_email)
      .delete();
    return result;
  }
}

class Util {
  async extractDataFromToken(agent) {
    let conv = agent.conv();
    let token = conv.user.profile.token;

    const ticket = await client.verifyIdToken({
      idToken: token, // <-- this comes from: conv.user.profile.token
      audience: CLIENT_ID // Specify the CLIENT_ID of the app that accesses the backend
      // Or, if multiple clients access the backend:
      //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
    });
    const payload = ticket.getPayload();
    let user = {
      username: payload["name"],
      given_name: payload["given_name"],
      family_name: payload["family_name"],
      picture: payload["picture"],
      email_verified: payload["email_verified"],
      email: payload["email"]
    };

    let valid = checkIfValidUser(user.email);

    if (valid) {
      return user;
    } else {
      return null;
    }
  }

  getContextWithParameters(agent, contextname) {
    return agent.context.get(contextname).parameters;
  }

  getContext(agent, contextname) {
    return agent.context.get(contextname);
  }

  setContextWithParameters(agent, contextname, lifespan, parameters) {
    agent.context.set({
      name: contextname,
      lifespan: lifespan,
      parameters: parameters
    });
  }

  saveUserInfo(agent, user) {
    agent.context.set({
      name: "user_info",
      lifespan: 20,
      parameters: user
    });
  }

  setFilterContext(agent, contextname, lifespan, parameters) {
    agent.context.set({
      name: contextname,
      lifespan: lifespan,
      parameters: parameters
    });
  }

  getFilterContext(agent, contextname) {
    return agent.context.get(contextname);
  }
}

module.exports.Database = Database;
module.exports.Util = Util;
module.exports.Auth = "dfakfkaf";
