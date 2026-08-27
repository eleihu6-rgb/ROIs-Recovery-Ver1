#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewStatusParser::init(vector<string>& headers) {}


//代码生成器:
//输入：id,crewId,description,reason,status,effDt,expDt
//正则式处理序列
//1、',' --> '\r\n'
//2、toCsv：(.+) --> else if \(headers\[i\] == \"\0\"\) { ss << ref->\1 << ", "; }
//3、fromCsv：(.+) --> else if \(headers\[index\] == \"\0\"\) { ref->\1 = value;}

static vector<string> crewStatusDefaultHeaders = { "id", "crewId", "description", "reason", "status", "effDt", "expDt" ,"disable"};
vector<string>& crewStatusParser::getDefaultHeaders() {
	return crewStatusDefaultHeaders;
}

void* crewStatusParser::createInstance() {
	return new CREW_STATUS();
}

void crewStatusParser::deleteInstance(void* obj) {
	delete (CREW_STATUS*)obj;
}

string crewStatusParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_STATUS * ref = (CREW_STATUS *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idcrew << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "reason") { ss << ref->reason << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expdt) << "^"; }
		else if (headers[i] == "disable") { ss << ref->disable << "^"; }
		//else { logUnkonwnField("crew_status", headers[i]); }
	}
	return ss.str();
}

void crewStatusParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_STATUS * ref = (CREW_STATUS *)obj;
	if (headers[index] == "id") { }
	else if (headers[index] == "crewId") { ref->idcrew = value; }
	else if (headers[index] == "description") { ref->description = value; }
	else if (headers[index] == "reason") { ref->reason = value; }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "effDt") { ref->effDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expdt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "disable") { ref->disable = value; }

	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("crew_status", headers[index]); }
}

