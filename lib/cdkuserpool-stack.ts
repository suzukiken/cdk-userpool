import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";

interface Props extends cdk.StackProps {
    name_prefix: string
}

export class CdkuserpoolStack extends cdk.Stack {
  
  constructor(scope: cdk.Construct, id: string, props: Props) {
    super(scope, id, props);
    
    const GOOGLE_CLIENT_ID = "<xxxx.apps.googleusercontent.com>" // replace <xxxx.apps.googleusercontent.com> with real client id.
    const GOOGLE_CLIENT_SECRET = "<xxx-xxxxxxxxx-xxxxxxxxxx>" // replace <xxx-xxxxxxxxx-xxxxxxxxxx> with real client secret.
    const ALLOWED_EMAILS = "a@example.com, b@example.com," // replace x@example.com with real emails for signup whitelist.
    const ALLOWED_DOMAINS = "c.example.com, d.example.com" // replace x.example.com with real domain name for signup whitelist.
    const COGNITO_CALLBACK_URL = "https://e.example.com/,https://f.example.com/" // replace https://x.example.com/ with real appli client signin callback url.
    const COGNITO_LOGIN_URL = COGNITO_CALLBACK_URL
    
    // Lambda Sign Up Trigger

    const trigger_function = new lambda.Function(this, "lambda_function", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset("lambda"),
      handler: "signup_trigger.lambda_handler",
      functionName: props.name_prefix + "signup-trigger",
      environment: {
        ALLOWED_EMAILS: ALLOWED_EMAILS,
        ALLOWED_DOMAINS: ALLOWED_DOMAINS
      }
    });

    // Cognito User Pool with Google idP

    const user_pool = new cognito.UserPool(this, "user_pool", {
      selfSignUpEnabled: false,
      userPoolName: props.name_prefix + "user-pool",
      lambdaTriggers: {
        preSignUp: trigger_function,
      },
    });

    const google_idp = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "user_pool_idp_google",
      {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        userPool: user_pool,
        scopes: ["profile", "email", "openid"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        },
      }
    );

    // Cognito User Pool Settings

    const COGNITO_DOMAIN_PREFIX = props.name_prefix.split('-').join('')

    new cognito.UserPoolDomain(this, "user_pool_domain", {
      cognitoDomain: {
        domainPrefix: COGNITO_DOMAIN_PREFIX,
      },
      userPool: user_pool,
    });

    const oauth_settings = {
      callbackUrls: cdk.Fn.split(",", COGNITO_CALLBACK_URL),
      logoutUrls: cdk.Fn.split(",", COGNITO_LOGIN_URL),
      flows: {
        authorizationCodeGrant: true,
        clientCredentials: false,
        implicitCodeGrant: true,
      },
      scopes: [
        cognito.OAuthScope.EMAIL,
        cognito.OAuthScope.OPENID,
        cognito.OAuthScope.PROFILE,
        cognito.OAuthScope.COGNITO_ADMIN,
      ],
    };

    const user_pool_client_web = new cognito.UserPoolClient(
      this,
      "user_pool_client_web",
      {
        userPool: user_pool,
        generateSecret: false,
        userPoolClientName: props.name_prefix + "user-pool-client-web",
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.GOOGLE,
        ],
        oAuth: oauth_settings,
      }
    );
    
    const user_pool_client_native = new cognito.UserPoolClient(
      this,
      "user_pool_client_native",
      {
        userPool: user_pool,
        generateSecret: true,
        userPoolClientName: props.name_prefix + "user-pool-client-native",
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.GOOGLE,
        ],
        oAuth: oauth_settings,
      }
    );
    
    const google_idp_dependable = new cdk.ConcreteDependable();
    google_idp_dependable.add(google_idp);
    user_pool_client_web.node.addDependency(google_idp_dependable);
    user_pool_client_native.node.addDependency(google_idp_dependable);
    
    // Cognito Id Pool

    const id_pool = new cognito.CfnIdentityPool(this, "id_pool", {
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: user_pool_client_web.userPoolClientId,
          providerName: user_pool.userPoolProviderName,
          serverSideTokenCheck: false,
        },
        {
          clientId: user_pool_client_native.userPoolClientId,
          providerName: user_pool.userPoolProviderName,
          serverSideTokenCheck: false,
        },
      ],
      identityPoolName: props.name_prefix + "id-pool",
    });

    // Id Pool IAM Roles
    
    const iam_authenticated_role = new iam.Role(this, "iam_auth_role", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": id_pool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      roleName: props.name_prefix + "authenticated-role",
    });

    const iam_unauthenticated_role = new iam.Role(this, "iam_unauth_role", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": id_pool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      roleName: props.name_prefix + "unauthenticated-role",
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, "id_pool_role_attach", {
      identityPoolId: id_pool.ref,
      roles: {
        authenticated: iam_authenticated_role.roleArn,
        unauthenticated: iam_unauthenticated_role.roleArn,
      },
    });
  }
}
