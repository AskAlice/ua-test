if you know how to use git, have NodeJS installed, and have a text editor, you can use this template to check if you have to get tested or not.

clone the repo, cd into it, and run

```bash
npm i
```

On google cloud console, create an application, and enable the [google calendar api](https://console.cloud.google.com/marketplace/details/google/calendar-json.googleapis.com?tutorial=toc), then [create an oauth2 client id in the credentials tab](https://console.cloud.google.com/apis/credentials), and download the credentials.json file, and put it in the root of the project.

Now, copy .env.example to .env, and fill in the values with values that match your information.

Then, run

```bash
node index.js
```

it should prompt you to authenticate with the oauth2 client you created, which should create token.json, then it should run the script.

You should create a cronjob that runs this every hour between 2:xx AM and 11:xx AM, preferably and then you should be good to go.

```bash
crontab -e
```

```bash
# add this line to the bottom of the file
7 2-11 * * * /bin/bash -c 'cd /root/ua-test/; node index.js'
```
