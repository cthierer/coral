
lint:
	@./node_modules/.bin/eslint --ext .js --cache src

build: lint
	@rm -rf lib
	@./node_modules/.bin/babel src --out-dir lib

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

pack: build
	@./bin/pack.sh

deploy: pack
	@aws lambda update-function-code \
		--function-name "$$(aws cloudformation describe-stack-resources --stack-name coral-$(env) --logical-resource-id UploadLambda | ./node_modules/node-jq/bin/jq -r '.StackResources[0].PhysicalResourceId')" \
		--zip-file fileb://coral.zip \
		--publish