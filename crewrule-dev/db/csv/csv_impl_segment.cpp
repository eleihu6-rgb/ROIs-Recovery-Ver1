#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

#include "RuleParams.h"

static vector<string> segmentDefaultHeaders = { "id", "scenarioId", "pairingId", "pairingDutyId", "dutySeq", "segSeq", "fltId", "fltDt", "assignment", 
"depStation", "arvStation", "airline", "fltNum", "fleet", "wpMins",
"schStartDtUtc", "schEndDtUtc", "schStartDtLocal", "schEndDtLocal", "actStartDtUtc", "actEndDtUtc", "actStartDtLocal", "actEndDtLocal", "isDeleted", "ver",
"splitDutyPickUpMin", "splitDutyDropOffMin", "splitDutyRestMin", "splitDutyHotelId", "rankCombCriteriaId",
"creditedMinutes", "fmCreditedMinutes", "schCreditedMinutes", "schFmCreditedMinutes", "dutyCodeType", "newDutyCode",
// 3.0
"rankCombC9aP", "rankCombC9aC", "rankCombC9aA", "isLongTransit", "createdBy" , "createdDt", "lastModified", "modifiedBy"};
vector<string>& segmentParser::getDefaultHeaders() {
	return segmentDefaultHeaders;
}

void segmentParser::init(vector<string>& headers) {}

void* segmentParser::createInstance() {
	return new Segment();
}

void segmentParser::deleteInstance(void* obj) {
	delete (Segment*)obj;
}

string segmentParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Segment * ref = (Segment *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getSegmentId() << "^"; }
		else if (headers[i] == "scenarioId" || headers[i] == "schId") { ss << ref->getScenarioId() << "^"; }///
		else if (headers[i] == "pairingId") { ss << ref->getPairingId() << "^"; }
		else if (headers[i] == "pairingDutyId") { ss << ref->getDutyId() << "^"; }
		else if (headers[i] == "dutySeq") { ss << ref->getDutySeq() << "^"; }
		else if (headers[i] == "segSeq") { ss  << ref->getSegSeq() << "^"; }
		else if (headers[i] == "fltId") { ss << ref->getDBId() << "^"; }
		else if (headers[i] == "fltDt") { ss << ref->getDate() << "^"; }

		else if (headers[i] == "assignment") { ss << ref->getAssignment() << "^"; }
		else if (headers[i] == "depStation") { ss << ref->getDepStation() << "^"; }//depArp
		else if (headers[i] == "arvStation") { ss << ref->getArrStation() << "^"; }//arvArp
		else if (headers[i] == "airline") { ss << ref->getAirline() <<"^"; }
		else if (headers[i] == "fltNum") { ss << ref->getFlightNumber() << "^"; }
		else if (headers[i] == "fleet") { ss << ref->getFleetCD() << "^"; }
		else if (headers[i] == "wpMins") { ss << (ref->getWorkPeriodInSec() / 60) << "^"; }

		else if (headers[i] == "schStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocSch()) << "^"; }///
		else if (headers[i] == "schEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocSch()) << "^"; }///
		else if (headers[i] == "actStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcAct()) << "^"; }///actStrDtUtc
		else if (headers[i] == "actEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcAct()) << "^"; }///
		else if (headers[i] == "actStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocAct()) << "^"; }///
		else if (headers[i] == "actEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocAct()) << "^"; }///

		else if (headers[i] == "isDeleted") { ss << (ref->isDeleted() ? "true" : "false") << "^"; }
		else if (headers[i] == "ver") { ss << "^"; }
		else if (headers[i] == "splitDutyPickUpMin") { ss << ref->getSplitDutyPickUpMin() << "^"; }
		else if (headers[i] == "splitDutyDropOffMin") { ss << ref->getSplitDutyDropOffMin() << "^"; }
		else if (headers[i] == "splitDutyRestMin") { ss << ref->getSplitDutyRestMin() << "^"; }
		else if (headers[i] == "splitDutyHotelId") { ss << ref->getSplitDutyHotelId() << "^"; }
		else if (headers[i] == "rankCombCriteriaId") { ss << ref->getRankCombCriteriaId() << "^"; } //20180920

		else if (headers[i] == "creditedMinutes") { ss << ref->getCreditInSec() / 60.0 << "^"; }
		else if (headers[i] == "fmCreditedMinutes") { ss << ref->getFirstMonthCreditInSec() / 60.0 << "^"; }
		else if (headers[i] == "schCreditedMinutes") { ss << ref->getSchCreditInSec() / 60.0 << "^"; }
		else if (headers[i] == "schFmCreditedMinutes") { ss << ref->getSchFirstMonthCreditInSec() / 60.0 << "^"; }

		else if (headers[i] == "createdBy") { ss << ref->getCreatedBy() << "^"; }///
		else if (headers[i] == "createdDt") { ss << utcToUtcTzString(ref->getCreatedDt()) << "^"; }///
		else if (headers[i] == "lastModified") { ss << utcToUtcTzString(ref->getLastModified()) << "^"; }///
		else if (headers[i] == "modifiedBy") { ss << ref->getModifiedBy() << "^"; }///

		//3.0
		else if (headers[i] == "rankCombC9aP") { ss << ref->getRankCombCP() << "^"; }
		else if (headers[i] == "rankCombC9aC") { ss << ref->getRankCombCC() <<"^"; }
		else if (headers[i] == "rankCombC9aA") { ss << ref->getRankCombCA() <<"^"; }

        else if (headers[i] == "isLongTransit") { ss << (ref->_isLongTransitWithNextSegment ? "true" : "false") << "^"; }

		else if (headers[i] == "dutyCodeType") { ss << ref->getDutyCodeType() << "^"; }
		else if (headers[i] == "newDutyCode") { ss << ref->getDutyCode() << "^"; }

		else { logUnkonwnField("segment", headers[i]); }
	}
	return ss.str();
}

void segmentParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Segment * ref = (Segment *)obj;

	if (headers[index] == "id") { ref->setSegmentId(atoll(value)); }
	else if (headers[index] == "scenarioId" || headers[index] == "schId") { ref->setScenarioId(atoll(value)); }///
	else if (headers[index] == "pairingId") { ref->setPairingId(atoll(value)) ; }
	else if (headers[index] == "pairingDutyId") { ref->setDutyId(atoll(value)); }
	else if (headers[index] == "segSeq") { ref->setSegSeq(atoi(value)); }
	else if (headers[index] == "dutySeq") { ref->setDutySeq(atoi(value)); }
	else if (headers[index] == "fltId") { ref->setDBId(atoll(value)); }
	else if (headers[index] == "fltDt") { ref->setDate(value); }

	else if (headers[index] == "assignment") { ref->setAssignment(value); }
	else if (headers[index] == "depStation") { //depArp
		if(ref->getDepStation() == "")
			ref->setDepStation(value); 
	}
	else if (headers[index] == "arvStation") { //arvArp
		if(ref->getArrStation() == "")
			ref->setArrStation(value) ;
	}
	else if (headers[index] == "airline") { ref->setAirline(value); }
	else if (headers[index] == "fltNum") { 
		//mantis#2545, Segment._flightNumber/_seg_seq_num中两个字段都表示fltNum，都需要赋值
		ref->setFlightNumber(value); 
		ref->setSegNumber(value);
	}
	else if (headers[index] == "fleet") { ref->setFleetCD(value); }
	else if (headers[index] == "wpMins") { ref->setWorkPeriodInSec((int)(atof(value) * 60)); }

	else if (headers[index] == "schStartDtUtc") { ref->setStartTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schEndDtUtc") { ref->setEndTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schStartDtLocal") { ref->setStartTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schEndDtLocal") { ref->setEndTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "actStartDtUtc") { if (!ref->getStartTimeUtcAct()) { ref->setStartTimeUtcAct(utcStrToUtc(value)); } }///actStrDtUtc
	else if (headers[index] == "actEndDtUtc") { if (!ref->getEndTimeUtcAct()) { ref->setEndTimeUtcAct(utcStrToUtc(value)); } }///
	else if (headers[index] == "actStartDtLocal") { ref->setStartTimeLocAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actEndDtLocal") { ref->setEndTimeLocAct(utcStrToUtc(value)); }///

	else if (headers[index] == "isDeleted") { ref->setIsDeleted(0 == strncmp("true", value, 4)); }
	else if (headers[index] == "ver") {}
	else if (headers[index] == "splitDutyPickUpMin") { ref->setSplitDutyPickUpMin(atoi(value)); }
	else if (headers[index] == "splitDutyDropOffMin") { ref->setSplitDutyDropOffMin(atoi(value)); }
	else if (headers[index] == "splitDutyRestMin") { ref->setSplitDutyRestMin(atoi(value)); }
	else if (headers[index] == "splitDutyHotelId") { ref->setSplitDutyHotelId(atoll(value)); }
	else if (headers[index] == "rankCombCriteriaId") { ref->setRankCombCriteriaId(atoll(value)); } //20180920
	else if (headers[index] == "rankCombC9aP") { ref->setRankCombCP(atoll(value)); } //3.0
	else if (headers[index] == "rankCombC9aC") { ref->setRankCombCC(atoll(value)); } //3.0
	else if (headers[index] == "rankCombC9aA") { ref->setRankCombCA(atoll(value)); } //3.0

	else if (headers[index] == "creditedMinutes") { ref->setCreditInSec((int)(atof(value) * 60)); }//Credit Hour(实际时间)
	else if (headers[index] == "fmCreditedMinutes") { ref->setFirstMonthCreditInSec((int)(atof(value) * 60)); }//首月Credit Hour(实际时间)
	else if (headers[index] == "schCreditedMinutes") { ref->setSchCreditInSec((int)(atof(value) * 60)); }//Credit Hour(计划时间)
	else if (headers[index] == "schFmCreditedMinutes") { ref->setSchFirstMonthCreditInSec((int)(atof(value) * 60)); }//首月Credit Hour(计划时间)

	else if (headers[index] == "createdBy") { ref->setCreatedBy(value); }///
	else if (headers[index] == "createdDt") { ref->setCreatedDt(utcStrToUtc(value)); }///
	else if (headers[index] == "lastModified") { ref->setLastModified(utcStrToUtc(value)); }///
	else if (headers[index] == "modifiedBy") { ref->setModifiedBy(value); }///

	else if (headers[index] == "depArp") { //3.0
		if(ref->getDepStation() == "")
			ref->setDepStation(value); 
	}
	else if (headers[index] == "arvArp") { //3.0
		if(ref->getArrStation() == "")
			ref->setArrStation(value); 
	}
	else if (headers[index] == "actStrDtUtc") { if (!ref->getStartTimeUtcAct()) { ref->setStartTimeUtcAct(utcStrToUtc(value)); } } //3.0
	else if (headers[index] == "actEndDtUtc") { if (!ref->getEndTimeUtcAct()) { ref->setEndTimeUtcAct(utcStrToUtc(value)); } } //3.0

    else if (headers[index] == "isLongTransit") { ref->_isLongTransitWithNextSegment = (0 == strncmp("true", value, 4)); }
	
	else if (headers[index] == "dutyCodeType") { ref->setDutyCodeType(value); }
	else if (headers[index] == "newDutyCode") { ref->setDutyCode(value); }

    else { logUnkonwnField("segment", headers[index]); }
}

void segmentParser::calculateLongTransitWithinDuty(Segment *first, Segment *second) {
    auto longtransit = RuleParams::GetInstancePtr()->getLongTransit(first, second);
    if (longtransit) {
        first->_isLongTransitWithNextSegment = true;
    }
}
