import { Construct } from 'constructs'
import * as path from 'path'
import {
	GraphqlApi,
	Schema,
	AuthorizationType,
	FieldLogLevel,
	MappingTemplate,
	PrimaryKey,
	Values,
	KeyCondition,
	AttributeValues,
	Assign,
} from '@aws-cdk/aws-appsync-alpha'
import {
	CfnOutput,
	Duration,
	Expiration,
	RemovalPolicy,
	Stack,
	StackProps,
} from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import {
	AccountRecovery,
	CfnUserPoolGroup,
	UserPool,
	UserPoolClient,
	VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito'
import * as s3 from 'aws-cdk-lib/aws-s3'
import {
	IdentityPool,
	UserPoolAuthenticationProvider,
} from '@aws-cdk/aws-cognito-identitypool-alpha'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'

export class AppsyncWithS3BackendStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props)

		const userPool = new UserPool(this, 'ProductTestUserPool', {
			selfSignUpEnabled: true,
			accountRecovery: AccountRecovery.PHONE_AND_EMAIL,
			userVerification: {
				emailStyle: VerificationEmailStyle.CODE,
			},
			autoVerify: {
				email: true,
			},
			standardAttributes: {
				email: {
					required: true,
					mutable: true,
				},
			},
		})

		new CfnUserPoolGroup(this, 'ProductUserPoolGroup', {
			userPoolId: userPool.userPoolId,
			groupName: 'Admin',
			description: 'Admin users for the ProductTestAPI',
		})

		const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
			userPool,
		})

		const identityPool = new IdentityPool(this, 'IdentityDemoPool', {
			identityPoolName: 'identityDemoForProductData',
			allowUnauthenticatedIdentities: true,
			authenticationProviders: {
				userPools: [
					new UserPoolAuthenticationProvider({ userPool, userPoolClient }),
				],
			},
		})

		const productBucket = new s3.Bucket(this, 's3-bucket', {
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
			cors: [
				{
					allowedMethods: [
						s3.HttpMethods.GET,
						s3.HttpMethods.POST,
						s3.HttpMethods.PUT,
						s3.HttpMethods.DELETE,
					],
					allowedOrigins: ['http://localhost:3000'],
					allowedHeaders: ['*'],
				},
			],
		})

		productBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ['s3:GetObject'],
				principals: [new iam.AnyPrincipal()],
				resources: [`arn:aws:s3:::${productBucket.bucketName}/public/*`],
			})
		)

		const mangedPolicyForAmplifyUnauth = new iam.ManagedPolicy(
			this,
			'mangedPolicyForAmplifyUnauth',
			{
				description:
					'managed policy to allow usage of Storage Library for unauth',
				statements: [
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:GetObject'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}/public/*`],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:GetObject'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}/protected/*`],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:ListBucket'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}`],
						conditions: {
							StringLike: {
								's3:prefix': [
									'public/',
									'public/*',
									'protected/',
									'protected/*',
								],
							},
						},
					}),
				],
				roles: [identityPool.unauthenticatedRole],
			}
		)

		const mangedPolicyForAmplifyAuth = new iam.ManagedPolicy(
			this,
			'mangedPolicyForAmplifyAuth',
			{
				description:
					'managed Policy to allow usage of storage library for auth',
				statements: [
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}/public/*`],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
						resources: [
							`arn:aws:s3:::${productBucket.bucketName}/protected/\${cognito-identity.amazonaws.com:sub}/*`,
						],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
						resources: [
							`arn:aws:s3:::${productBucket.bucketName}/private/\${cognito-identity.amazonaws.com:sub}/*`,
						],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:GetObject'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}/protected/*`],
					}),
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:ListBucket'],
						resources: [`arn:aws:s3:::${productBucket.bucketName}`],
						conditions: {
							StringLike: {
								's3:prefix': [
									'public/',
									'public/*',
									'protected/',
									'protected/*',
									'private/${cognito-identity.amazonaws.com:sub}/',
									'private/${cognito-identity.amazonaws.com:sub}/*',
								],
							},
						},
					}),
				],
				roles: [identityPool.authenticatedRole],
			}
		)

		// const api = new GraphqlApi(this, 'ProductTestAPI', {
		// 	name: 'ProductTestAPI',
		// 	schema: Schema.fromAsset(path.join(__dirname, 'schema.graphql')),
		// 	authorizationConfig: {
		// 		defaultAuthorization: {
		// 			authorizationType: AuthorizationType.USER_POOL,
		// 			userPoolConfig: {
		// 				userPool,
		// 			},
		// 		},
		// 		additionalAuthorizationModes: [
		// 			{ authorizationType: AuthorizationType.IAM },
		// 		],
		// 	},
		// 	logConfig: {
		// 		fieldLogLevel: FieldLogLevel.ALL,
		// 	},
		// 	xrayEnabled: true,
		// })

		// const productTable = new Table(this, 'AppSync Product Table', {
		// 	removalPolicy: RemovalPolicy.DESTROY,
		// 	billingMode: BillingMode.PAY_PER_REQUEST,
		// 	partitionKey: { name: 'id', type: AttributeType.STRING },
		// })

		// api
		// 	.addDynamoDbDataSource('ProductTableQueryGetProduct', productTable)
		// 	.createResolver({
		// 		typeName: 'Query',
		// 		fieldName: 'getProduct',
		// 		requestMappingTemplate: MappingTemplate.dynamoDbGetItem('id', 'id'),
		// 		responseMappingTemplate: MappingTemplate.dynamoDbResultItem(),
		// 	})

		new CfnOutput(this, 'ProductBucketName', {
			value: productBucket.bucketName,
		})
		new CfnOutput(this, 'ProductBucketRegion', {
			value: this.region,
		})
		new CfnOutput(this, 'UserPoolId', {
			value: userPool.userPoolId,
		})

		new CfnOutput(this, 'UserPoolClientId', {
			value: userPoolClient.userPoolClientId,
		})
		new CfnOutput(this, 'IdentityPoolId', {
			value: identityPool.identityPoolId,
		})

		// new CfnOutput(this, 'GraphQLAPIURL', {
		// 	value: api.graphqlUrl,
		// })
		// new CfnOutput(this, 'GraphQLAPIKey', {
		// 	value: api.apiKey as string,
		// })

		// new CfnOutput(this, 'GraphQLAPIID', {
		// 	value: api.apiId,
		// })
	}
}
