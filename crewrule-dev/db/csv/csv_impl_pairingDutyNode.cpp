#pragma once

#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void pairingDutyNodeParser::init(vector<string>& headers) {}


string pairingDutyNodeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	PairingDutyNode * ref = (PairingDutyNode *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getId() << "^"; }
		else if (headers[i] == "schId") { ss << ref->getScenarioId() << "^"; }///
		else if (headers[i] == "pairingId") { ss << ref->getPairingId() << "^"; }
		else if (headers[i] == "dutyId") { ss << ref->getDutyId() << "^"; }
		else if (headers[i] == "fromSegmentId") { ss << ref->getFromSegmentId() << "^"; }
		else if (headers[i] == "toSegmentId") { ss << ref->getToSegmentId() << "^"; }
		else if (headers[i] == "sequence") { ss << ref->getSequence() << "^"; }
		else if (headers[i] == "type") { ss << ref->getType() << "^"; }
		else if (headers[i] == "node") { ss << ref->getNode() << "^"; }
		else if (headers[i] == "startLoc") { ss << utcToUtcTzString(ref->getStartLoc()) << "^"; }//mantis#6761, 问题1, format: 2019-01-01T00:00:00
		else if (headers[i] == "endLoc") { ss << utcToUtcTzString(ref->getEndLoc()) << "^"; }
		else if (headers[i] == "startUtc") { ss << utcToUtcTzString(ref->getStartUtc()) << "^"; }
		else if (headers[i] == "endUtc") { ss << utcToUtcTzString(ref->getEndUtc()) << "^"; }
		else if (headers[i] == "groupId") { ss << ref->getGroupId() << "^"; }
		else if (headers[i] == "airport") { ss << ref->getAirport() << "^"; }//mantis#6761, 问题3, 补齐airport字段
		else if (headers[i] == "isManualModify") { ss << (ref->getIsManualModify() ? "true" : "false") << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->getScenarioId() << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->getModifiedBy() << "^"; }///
		else if (headers[i] == "lastModified") { ss << utcToUtcTzString(ref->getLastModified()) << "^"; }///
		else { logUnkonwnField("pairing_duty_node", headers[i]); }
	}
	return ss.str();
}

void pairingDutyNodeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	PairingDutyNode * ref = (PairingDutyNode *)obj;

	if (headers[index] == "id") { ref->setId(atoll(value)); }
	else if (headers[index] == "schId" || headers[index] == "scenarioId") { ref->setScenarioId(atoll(value)); }///
	else if (headers[index] == "pairingId") { ref->setPairingId(atoll(value)); }
	else if (headers[index] == "dutyId") { ref->setDutyId(atoll(value)); }
	else if (headers[index] == "fromSegmentId") { ref->setFromSegmentId(atoll(value)); } //这里实际是航班ID fromFltId
	else if (headers[index] == "toSegmentId") { ref->setToSegmentId(atoll(value)); } //这里实际是航班ID toFltId
	else if (headers[index] == "sequence") { ref->setSequence(atoi(value)); }
	else if (headers[index] == "type") { ref->setType(value); }
	else if (headers[index] == "node") { ref->setNode(value); }
	else if (headers[index] == "startLoc") { ref->setStartLoc(utcStrToUtc(value)); }
	else if (headers[index] == "endLoc") { ref->setEndLoc(utcStrToUtc(value)); }
	else if (headers[index] == "startUtc") { ref->setStartUtc(utcStrToUtc(value)); }
	else if (headers[index] == "endUtc") { ref->setEndUtc(utcStrToUtc(value)); }
	else if (headers[index] == "groupId") { ref->setGroupId(atoll(value)); }
	else if (headers[index] == "airport") { ref->setAirport(value); }//mantis#6761, 问题3, 补齐airport字段
	else if (headers[index] == "isManualModify") { ref->setIsManualModify(0 == strncmp("true", value, 4)); }
	else if (headers[index] == "schId") {}
	else if (headers[index] == "modifiedBy") { ref->setModifiedBy(value); }///
	else if (headers[index] == "lastModified") { ref->setLastModified(utcStrToUtc(value)); }///
	else if (headers[index] == "preStartUtc") { }//3.0
	else if (headers[index] == "crewId") { }//3.0
	else { logUnkonwnField("pairing_duty_node", headers[index]); }

}

void* pairingDutyNodeParser::createInstance() {
	return new PairingDutyNode();
}

void pairingDutyNodeParser::deleteInstance(void* obj) {
	delete (PairingDutyNode*)obj;
}

static vector<string> pairingDutyNodeHeaders = { "id", "pairingId", "dutyId", "fromSegmentId", "toSegmentId", "sequence",
"type", "node", "startLoc", "endLoc", "groupId","airport", "startUtc", "endUtc" , "isManualModify", "modifiedBy","lastModified",
//3.0
"schId"
};
vector<string>& pairingDutyNodeParser::getDefaultHeaders() {
	return pairingDutyNodeHeaders;
}