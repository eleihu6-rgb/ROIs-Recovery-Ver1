#include <sstream>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewFirstDutyInfoParser::init(vector<string>& headers) {}


//mantis#2228, 增加crew_base.isPrimeEntitlement读写
string crewFirstDutyInfoParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_FIRST_DUTY_INFO* ref = (CREW_FIRST_DUTY_INFO*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "lastFirstDutyDate") { ss << ref->lastFirstDutyDate << "^"; }
		else if (headers[i] == "totalBlh") { ss << ref->totalBlh << "^"; }
		else if (headers[i] == "totalFltNum") { ss << ref->totalFltNum << "^"; }
		else if (headers[i] == "airports") { ss << joinMapToStr(ref->airports); }
		else { logUnkonwnField("CREW_FIRST_DUTY_INFO", headers[i]); }
	}
	return ss.str();
}

//mantis#2228, 增加crew_base.isPrimeEntitlement读写
void crewFirstDutyInfoParser::fromCsv(vector<string>& headers, int i, char* value, void* obj) {
	CREW_FIRST_DUTY_INFO* ref = (CREW_FIRST_DUTY_INFO*)obj;

	if (headers[i] == "id") {}
	else if (headers[i] == "crewId") { ref->crewId = value; }
	else if (headers[i] == "lastFirstDutyDate") { ref->lastFirstDutyDate = utcStrToUtc(value); }
	else if (headers[i] == "totalBlh") { ref->totalBlh = atoi(value); }
	else if (headers[i] == "totalFltNum") { ref->totalFltNum = atoi(value); }
	else if (headers[i] == "airprots") { 
		vector<string> parts;
		split(value, ',', parts);
		for (const auto& part : parts) {
			size_t p1 = part.find(":\"");
			size_t p2 = part.find("\":");
			string key = part.substr(p1 + 2, p2 - p1 - 2);
			int val = stoi(part.substr(p2 + 2));
			ref->airports[key] = val;
		}
	}

	else { logUnkonwnField("CREW_FIRST_DUTY_INFO", headers[i]); }
}
void* crewFirstDutyInfoParser::createInstance() {
	return new CREW_FIRST_DUTY_INFO();
}

void crewFirstDutyInfoParser::deleteInstance(void* obj) {
	delete (CREW_FIRST_DUTY_INFO*)obj;
}

static vector<string> crewFirstDutyInfoDefaultHeaders = { "crewId", "lastFirstDutyDate", "totalBlh", "totalFltNum", "airports"};
vector<string>& crewFirstDutyInfoParser::getDefaultHeaders() {
	return crewFirstDutyInfoDefaultHeaders;
}