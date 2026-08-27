
#include <stdio.h>
#include <time.h>
#include <fstream>
#include "RuleTool.h"
#include "UtilFunc.h"
#include "RuleParams.h"

#include <unordered_map>

RuleTool::RuleTool() {
	//0002650: LIVE 8002出现打开区间外的告警,RuleTool 属于BATCH_LEGALITY
	_legality = SharedPtr<LegalityChecker>(new LegalityChecker(BATCH_LEGALITY,false));
	dbData = SharedPtr<CrewDataContext>(new CrewDataContext);
	//ctx = SharedPtr<PairingDBContext>(new PairingDBContext);
	RuleParams::GetInstancePtr()->setApplication(_legality->GetApplication());
	loadDatabaseConnectionInfo();
	
	unordered_map<int, int> m;
}


void RuleTool::loadDatabaseConnectionInfo() {
	string database_conx = "Database_connection.txt";

	ifstream indata(database_conx.c_str());

	if (!indata) {
		cout << "WARN: database_conx file could not be opened, "
			<< "default db is " << connStr << endl;
		return;
	}

	string nextToken;
	indata >> nextToken;
	connStr = nextToken.c_str();

	indata >> nextToken;
	dbUser = nextToken.c_str();

	indata >> nextToken;
	dbPassword = nextToken.c_str();

	indata.close();
}
//int RuleTool::errorCode() {
//	return this->errorCode;
//}


void RuleTool::setDbConfig(string connStr, string user, string password) {
	this->connStr = connStr;
	this->dbUser = user;
	this->dbPassword = password;
}

void RuleTool::setServerAddr(string value) {
	//
	//移除前缀 'http://'
	size_t pos = strToUpper(value).find("HTTP://");
	if (pos != string::npos) {
		value = value.substr(pos + strlen("HTTP://"));
	}
	//
	//移除后缀 '/'
	if (value.at(value.length() - 1) == '/') {
		value = value.substr(0, value.length() - 1);
	}

	_serverAddr = value; 

	if (this->dbData) {
		dbData->configDataSourceUrl = _serverAddr;
		cout << "set serverAddr=" << _serverAddr << endl;
	}
}