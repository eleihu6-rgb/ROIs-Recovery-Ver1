#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

static vector<string> sysParamDefaultHeaders = { "paramName", "paramValues", "appIds", "paramDesc", "lastModified", "modifiedBy", "id" };
vector<string>& sysParamParser::getDefaultHeaders() {
	return sysParamDefaultHeaders;
}

void sysParamParser::init(vector<string>& headers) {}

void* sysParamParser::createInstance() {
	return new csvSystemParam();
}

void sysParamParser::deleteInstance(void* obj) {
	delete (csvSystemParam*)obj;
}

string sysParamParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvSystemParam * ref = (csvSystemParam *)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "paramName") { ss << ref->parmName<< "^"; }
		else if (headers[i] == "paramValues") { ss << ref->parmValue << "^"; }
		else if (headers[i] == "appIds") { ss << ref->idapp << "^"; }
		else if (headers[i] == "paramDesc") { ss << ref->parmDesc << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("sys_param", headers[i]); }
	}
	return ss.str();
}

void sysParamParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvSystemParam * ref = (csvSystemParam *)obj;

	if (headers[index] == "paramName") { ref->parmName = value; }
	else if (headers[index] == "paramValues") { ref->parmValue = value; }
	else if (headers[index] == "appIds") { ref->idapp = value; }
	else if (headers[index] == "paramDesc") { ref->parmDesc = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("sys_param", headers[index]); }
}

