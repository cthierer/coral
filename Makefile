
lint:
	@./node_modules/.bin/eslint --ext .js --cache src

build-client: lint
	@rm -rf dist
	@NODE_ENV=production ./node_modules/.bin/webpack --config webpack.config.js --env.prod

build-server: lint
	@rm -rf lib
	@./node_modules/.bin/babel src --out-dir lib

build: build-client build-server

validate-cf:
	@aws cloudformation validate-template \
		--template-body file://./cf.yml

build-stack: validate-cf
	@aws cloudformation create-stack \
		--stack-name coral-$(env) \
		--template-body file://./cf.yml \
		--capabilities CAPABILITY_IAM \
		--parameters \
		  ParameterKey=Environment,ParameterValue=$(env) \
			ParameterKey=Product,ParameterValue=topgun \
		--tags \
			Key=Project,Value=coral \
			Key=Environment,Value=$(env) \
			Key=Product,Value=topgun

update-stack: validate-cf
	@aws cloudformation update-stack \
		--stack-name coral-$(env) \
		--template-body file://./cf.yml \
		--capabilities CAPABILITY_IAM \
		--parameters \
		  ParameterKey=Environment,UsePreviousValue=true \
			ParameterKey=Product,UsePreviousValue=true

pack: build-server
	@rm coral.zip
	@docker build --tag coral:latest --quiet . > /dev/null
	@docker run coral:latest cat package.zip > coral.zip

deploy-upload: pack
	@aws lambda update-function-code \
		--function-name "$$(aws cloudformation describe-stack-resources --stack-name coral-$(env) --output json --logical-resource-id UploadLambda | ./node_modules/node-jq/bin/jq -r '.StackResources[0].PhysicalResourceId')" \
		--zip-file fileb://coral.zip \
		--publish

deploy-publish: pack
	@aws lambda update-function-code \
		--function-name "$$(aws cloudformation describe-stack-resources --stack-name coral-$(env) --output json --logical-resource-id PublishLambda | ./node_modules/node-jq/bin/jq -r '.StackResources[0].PhysicalResourceId')" \
		--zip-file fileb://coral.zip \
		--publish

deploy-process: pack
	@aws lambda update-function-code \
		--function-name "$$(aws cloudformation describe-stack-resources --stack-name coral-$(env) --output json --logical-resource-id ProcessLambda | ./node_modules/node-jq/bin/jq -r '.StackResources[0].PhysicalResourceId')" \
		--zip-file fileb://coral.zip \
		--publish

deploy-index: pack
	@aws lambda update-function-code \
		--function-name "$$(aws cloudformation describe-stack-resources --stack-name coral-$(env) --output json --logical-resource-id BuildIndexLambda | ./node_modules/node-jq/bin/jq -r '.StackResources[0].PhysicalResourceId')" \
		--zip-file fileb://coral.zip \
		--publish

deploy: deploy-upload deploy-publish deploy-process deploy-index

publish: build-client
	@aws s3 sync dist s3://"$$(aws cloudformation describe-stacks --stack-name coral-$(env) --output json | ./node_modules/node-jq/bin/jq -r '.Stacks[0].Outputs[0].OutputValue')"/scripts
