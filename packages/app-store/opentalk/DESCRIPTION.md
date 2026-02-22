---
items:
  - 1.jpeg
  - 2.jpeg
  - 3.jpeg
---

<p>This App allows you to use a single OpenTalk instance for video calls. Every user needs their own set of OpenTalk credentials/account.</p>

<p><strong>Disclaimer:</strong> This is an inofficial community-based App/integration for Cal.com. We're not associated with OpenTalk whatsoever, just fans and users of their product. We do not offer any guaranteed support for this integration (still, let us know if it doesn't work for you).</p>

<h2>Prerequisites</h2>
<ul>
  <li>This will only work if you use Keycloak as your IdP with OpenTalk</li>
  <li>You need admin access to setup Keycloak for this integration</li>
</ul>

<h2>Installation</h2>
<ol>
  <li>Go to your Keycloak Admin console, select the correct OpenTalk realm, select "Clients" and "Create Client"
  <ul>
    <li>Client type: OpenID Connect</li>
    <li>Client ID: Pick something you can remember (e.g. opentalk-calcom)</li>
    <li>Name: Pick a human readable name (e.g. OpenTalk Cal.com integration)
    <li>On the second page: Activate "Client authentication" Toggle</li>
    <li>On the third page: Add your Cal.com URL followed by /api/integrations/opentalk/callback to "Valid Redirect URIs" (e.g. https://cal.mycompany.com/api/integrations/opentalk/callback)
  </ul>
  </li>
  <li>Save the Client, find the "Credentials" tab and write down your "Client secret"</li>
  <li>Install this App in Cal.com and enter the following variables:
    <ul><li>`base_url`: This is the URL of your OpenTalk controller</li>
    <li>`web_url`: This is the URL of your OpenTalk web interface</li>
    <li>`client_id`: Taken from the Keycloak Client</li>
    <li>`client_secret`: Taken from the Keycloak Client</li></ul></li>
</ol>


