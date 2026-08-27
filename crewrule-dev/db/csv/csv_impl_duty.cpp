#include <sstream>
#include <string.h>
#include <math.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include "Utility.h"

void dutyParser::init(vector<string>& headers) {}


static vector<string> dutyDefaultHeaders = { "id", "scenarioId", "pairingId", "dutySeq", "dutyType", "pickupMinutes", 
"briefMinutes", "debriefMinutes", "dropOffMinutes", "startAirport", "endAirport", "region", "minimalRestMinutes", // "startAirport" = "strArp","endAirport" = "endArp"
"actualRestMinutes", "planFlightMinutes", "planFdpMinutes", "planDutyMinutes", "actFlightMinutes", "actFdpMinutes", 
"actualDutyMinutes", "creditedMinutes","fmCreditedMinutes", "schCreditedMinutes","schFmCreditedMinutes", "discretionType", "manualFdpDiscretion", "manualFtDiscretion", "manualRestDiscretion", "manualSectorDiscretion",
"fatigue", "layoverNights", "histricalFlightMinutes", "hotelId",
"isManualModify", "schStartDtUtc", "schEndDtUtc", "schStartDtLocal", "schEndDtLocal", "actStartDtUtc", "actEndDtUtc", 
"actStartDtLocal", "actEndDtLocal", "fdpDiscretionMin", "restDiscretionMin",
"maxFlightMin", "maxFdpMin", "maxDutyMin", "plnWpMin", "actWpMin", "rofMin", "wpAdjustment", "isDeleted", "ver", 
"splitDutyRestMin", "properties", "assignment" ,"checkInMinRestMin","trainingAddTime","refTz","etrTz","accState","layoverNits","comments", "attribute",
"isManualMaxFdp","extendFdpMin"
};

vector<string>& dutyParser::getDefaultHeaders() {
	return dutyDefaultHeaders;
}

void* dutyParser::createInstance() {
	return new Duty();
}

void dutyParser::deleteInstance(void* obj) {
	delete (Duty*)obj;
}

string dutyParser::toCsv(vector<string>& headers, void* obj) {


	stringstream ss;
	Duty * ref = (Duty *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getDutyId() << "^"; }
		else if (headers[i] == "scenarioId" || headers[i] == "schId") { ss << ref->getScenarioId() << "^"; }///
		else if (headers[i] == "pairingId") { ss << ref->getPairingId() << "^"; }
		else if (headers[i] == "dutySeq") { ss << ref->getDutySeq() << "^"; }
		else if (headers[i] == "dutyType") { ss << ref->getTypeStr() << "^"; }
		else if (headers[i] == "pickupMinutes") { ss << ref->getMinPickup() << "^"; }
		else if (headers[i] == "briefMinutes") { ss << ref->getMinBrief() << "^"; }//briefMin
		else if (headers[i] == "debriefMinutes") { ss << ref->getMinDebrief() << "^"; }//debriefMin
		else if (headers[i] == "dropOffMinutes") { ss << ref->getMinDropoff() << "^"; }
		else if (headers[i] == "startAirport") { ss << ref->getDepStation() << "^"; }//strArp
		else if (headers[i] == "endAirport") { ss << ref->getArrStation() << "^"; }//endArp
		else if (headers[i] == "region") { ss << ref->getRegion() << "^"; }
		else if (headers[i] == "minimalRestMinutes") { ss << ref->getMinRest() << "^"; }//minRestMin
		else if (headers[i] == "actualRestMinutes") { ss << ref->getActualRest() << "^"; }//actRestMin
		else if (headers[i] == "checkInMinRestMin") { ss << ref->getCheckInMinRest() << "^"; }
		else if (headers[i] == "planFlightMinutes") { ss << ref->getPlanBlockTime() << "^"; }//planFlightMin
		else if (headers[i] == "planFdpMinutes") { ss << ref->getFDPInSecs() / 60 << "^"; }//planFdpMin
		else if (headers[i] == "planDutyMinutes") { ss << ref->getDPInSecs() / 60 << "^"; }
		else if (headers[i] == "actFlightMinutes") { ss << ref->getActualBlockTime() << "^"; }//actFlightMin
		else if (headers[i] == "actFdpMinutes") { ss << ref->getActualFDP() << "^"; }//actFdpMin
		else if (headers[i] == "actualDutyMinutes") { ss << ref->getActualDP() << "^"; } //actDpMin
		else if (headers[i] == "creditedMinutes") { ss << Utility::round(ref->getCreditInSec()/60.0, 2) << "^"; }
		else if (headers[i] == "fmCreditedMinutes") { ss << Utility::round(ref->getFirstMonthCreditInSec() / 60.0, 2) << "^"; }
		else if (headers[i] == "schCreditedMinutes") { ss << Utility::round(ref->getSchCreditInSec() / 60.0, 2) << "^"; }
		else if (headers[i] == "schFmCreditedMinutes") { ss << Utility::round(ref->getSchFirstMonthCreditInSec() / 60.0, 2) << "^"; }
		else if (headers[i] == "discretionType") { ss << ref->getOriginDiscretionType()  << "^"; }
		else if (headers[i] == "manualFdpDiscretion") { ss << ref->getManualFdpDiscretion() << "^"; }
		else if (headers[i] == "manualFtDiscretion") { ss << ref->getManualFtDiscretion() << "^"; }
		else if (headers[i] == "manualRestDiscretion") { ss << ref->getManualRestDiscretion() << "^"; }
		else if (headers[i] == "manualDpDiscretion") { ss << ref->getManualDpDiscretion() << "^"; }
		else if (headers[i] == "manualSectorDiscretion") { ss << ref->getManualSectorDiscretion() << "^"; }
		else if (headers[i] == "trainingAddTime") { ss << (ref->isTrainingAddTime() ? 1 : 0) << "^"; }
		else if (headers[i] == "fatigue") { ss << ref->getTotalFatiguePoints() << "^"; }
		else if (headers[i] == "layoverNights") { ss << ref->getNumLayoverNights() << "^"; }
		else if (headers[i] == "histricalFlightMinutes") { ss << ref->getFlyHoursHistory() * 60 <<  "^"; }
		else if (headers[i] == "hotelId") { ss << ref->getHotelId() <<"^"; }
		else if (headers[i] == "isManualModify") { ss << (ref->getIsManualModify()?"true":"false") << "^"; }

		else if (headers[i] == "schStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocSch()) << "^"; }///
		else if (headers[i] == "schEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocSch()) << "^"; }///
		else if (headers[i] == "actStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcAct()) << "^"; }///actStrDtUtc
		else if (headers[i] == "actEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcAct()) << "^"; }///
		else if (headers[i] == "actStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocAct()) << "^"; }///
		else if (headers[i] == "actEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocAct()) << "^"; }///

		else if (headers[i] == "fdpDiscretionMin") { ss << ref->getFdpDiscretion() <<"^"; }///
		else if (headers[i] == "restDiscretionMin") { ss << "^"; }///
		
		else if (headers[i] == "maxFlightMin") {
			int maxFlightMin = ref->getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK);
			ss << (maxFlightMin < 0 ? 0 : maxFlightMin) << "^";
		}
		else if (headers[i] == "maxFdpMin") { 
			int maxFdpMin = ref->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			ss << (maxFdpMin < 0 ? 0 : maxFdpMin) << "^";
		}
		else if (headers[i] == "extendFdpMin") { ss << ref->getExtendFdpMin() << "^"; }
		else if (headers[i] == "maxDutyMin") {
			int maxDutyMin = ref->getLimitationValue(RULE_LIMITATION_TYPE::MAX_DP);
			ss << (maxDutyMin < 0 ? 0 : maxDutyMin) << "^";
		}
		else if (headers[i] == "plnWpMin") { ss << (ref->getPlanWorkPeriodInSec() / 60) << "^"; }///
		else if (headers[i] == "actWpMin") { ss << (ref->getActWorkPeriodInSec() / 60) << "^"; }///
		else if (headers[i] == "rofMin") { ss <<  "^"; }///
		else if (headers[i] == "longTransitMins") { ss << ref->getLongTransitMins() << "^"; }///

		else if (headers[i] == "wpAdjustment") { ss << (ref->getWorkPeriodAdjustmentInSec() / 60) << "^"; }//OP#1530
		else if (headers[i] == "isDeleted") { ss << (ref->isDeleted() ? "true" : "false") << "^"; }
		else if (headers[i] == "ver") { ss << ref->getVer() << "^"; }
		else if (headers[i] == "splitDutyRestMin") { ss << "^"; }
		else if (headers[i] == "properties") { ss <<  "^"; }
		else if (headers[i] == "splitDutyPickUpMin") { ss <<ref->getSpiltDutyPickUpMin() <<"^"; }
		else if (headers[i] == "splitDutyDropOffMin") { ss << ref->getSpiltDutyDropOffMin() << "^"; }
		else if (headers[i] == "assignment") { ss << ref->getAssignment() << "^"; }
		else if (headers[i] == "layoverNits") { ss << ref->getNumLayoverNights() << "^"; }///

		else if (headers[i] == "refTz") { ss << ref->getRefTz() << "^"; }///
		else if (headers[i] == "etrTz") { ss << ref->getEtrTz() << "^"; }///
		else if (headers[i] == "accState") { ss << ref->getAccState() << "^"; }///
		else if (headers[i] == "comments") { ss << ref->getComments() << "^"; }///
		else if (headers[i] == "attribute") { ss << ref->getAttributes() << "^"; }
		else if (headers[i] == "fdpExtensionMinutes") { ss << ref->getFdpExtensionMinutes() << "^"; }
		else if (headers[i] == "isManualMaxFdp") { ss << (ref->isManualMaxFdp() ? "1" : "0") << "^"; }
		
		else if (headers[i] == "createdBy") { ss << ref->getCreatedBy() << "^"; }///
		else if (headers[i] == "createdDt") { ss << utcToUtcTzString(ref->getCreatedDt()) << "^"; }///
		else if (headers[i] == "lastModified") { ss << utcToUtcTzString(ref->getLastModified()) << "^"; }///
		else if (headers[i] == "modifiedBy") { ss << ref->getModifiedBy() << "^"; }///
		else { logUnkonwnField("duty", headers[i]); }
	}
	return ss.str();
}

void dutyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Duty * ref = (Duty *)obj;
	int i = index;
	if (headers[i] == "id") { ref->setDutyId(atoll(value)); }
	else if (headers[i] == "scenarioId" || headers[i] == "schId") { ref->setScenarioId(atoll(value)); }///
	else if (headers[i] == "pairingId") { ref->setPairingId(atoll(value)); }
	else if (headers[i] == "dutySeq") { ref->setDutySeq(atoi(value)); }
	else if (headers[i] == "dutyType") { ref->setTypeByStr(value); }
	else if (headers[i] == "pickupMinutes") { ref->setActualPickupMin(atoi(value)); }
	else if (headers[i] == "briefMinutes" || headers[i] == "briefMin") { ref->setActualBriefMin(atoi(value));} //briefMin
	else if (headers[i] == "debriefMinutes" || headers[i] == "debriefMin") { ref->setActualDebriefMin(atoi(value)); } //debriefMin
	else if (headers[i] == "dropOffMinutes") { ref->setActualDropoffMin(atoi(value)); }
	else if (headers[i] == "startAirport") { } //strArp
	else if (headers[i] == "endAirport") { } //endArp
	else if (headers[i] == "region") { ref->setRegion(string(value)); }
	else if (headers[i] == "minimalRestMinutes") { ref->setMinRest(atoi(value))  ;}//minRestMin
	else if (headers[i] == "actualRestMinutes") { //actRestMin
		ref->setActualRest(atoi(value)); 
		ref->setDisplayedActualRest(atoi(value));
	}
	else if (headers[i] == "checkInMinRestMin") { /*ref->setCheckInMinRest(atoi(value)); */ }
	else if (headers[i] == "planFlightMinutes") { ref->setFlyHours(atoi(value) / 60); ref->setPlanBlockTime(atoi(value)); } //planFlightMin
	else if (headers[i] == "actualFlightMinutes") { ref->setActualBlockTime(atoi(value)); }
	else if (headers[i] == "actualFdpMinutes") { ref->setActualFDP(atoi(value)); }
	else if (headers[i] == "actualDutyMinutes") { ref->setActualDP(atoi(value)); } //actDpMin
	
	else if (headers[i] == "creditedMinutes") {	ref->setCreditInSec((int)(atof(value) * 60));}//Credit Hour(实际时间)
	else if (headers[i] == "fmCreditedMinutes") { ref->setFirstMonthCreditInSec((int)(atof(value) * 60)); }//首月Credit Hour(实际时间)
	else if (headers[i] == "schCreditedMinutes") { ref->setSchCreditInSec((int)(atof(value) * 60)); }//Credit Hour(计划时间)
	else if (headers[i] == "schFmCreditedMinutes") { ref->setSchFirstMonthCreditInSec((int)(atof(value) * 60)); }//首月Credit Hour(计划时间)
	else if (headers[i] == "plnWpMin") { ref->setPlanWorkPeriodInSec((int)(atof(value) * 60)); }
	else if (headers[i] == "actWpMin") { ref->setActWorkPeriodInSec((int)(atof(value) * 60)); }
	else if (headers[i] == "wpAdjustment") { ref->setWorkPeriodAdjustmentInSec((int)(atof(value) * 60)); }

	else if (headers[i] == "fatigue") { ref->setTotalFatiguePoints(atof(value));}
	else if (headers[i] == "layoverNights") { ref->setNumLayoverNights(atoi(value)); }
	else if (headers[i] == "layoverNits") { ref->setNumLayoverNights(atoi(value)); } // 3.0 新疆组字段
	else if (headers[i] == "histricalFlightMinutes") { }
	else if (headers[i] == "hotelId") { ref->setHotelId(atoll(value)); }
	else if (headers[i] == "isManualModify") { ref->setIsManualModify(0 == strncmp("true", value, 4)); }

	else if (headers[index] == "schStartDtUtc") { ref->setStartTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schEndDtUtc") { ref->setEndTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schStartDtLocal") { ref->setStartTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schEndDtLocal") { ref->setEndTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "actStartDtUtc") { ref->setStartTimeUtcAct(utcStrToUtc(value)); }///actStrDtUtc
	else if (headers[index] == "actEndDtUtc") { ref->setEndTimeUtcAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actStartDtLocal") { ref->setStartTimeLocAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actEndDtLocal") { ref->setEndTimeLocAct(utcStrToUtc(value)); }///

	else if (headers[index] == "fdpDiscretionMin") { ref->setFdpDiscretion(atoi(value)); }///
	else if (headers[index] == "restDiscretionMin") {}///
	else if (headers[index] == "actFlightMinutes") {}///actFlightMin
	else if (headers[index] == "actFdpMinutes") {}///actFdpMin
	else if (headers[index] == "maxFltMin") { }
	else if (headers[index] == "maxFdpMin") { ref->setManualMaxFdp(atoi(value)); }
	else if (headers[index] == "extendFdpMin") { }
	else if (headers[index] == "maxDutyMin") {  }
	else if (headers[index] == "plnWpMin") {  }
	else if (headers[index] == "actWpMin") {}
	else if (headers[index] == "rofMin") { }
	else if (headers[index] == "longTransitMins") { ref->setLongTransitMins(atoi(value)); }
	else if (headers[index] == "wpAdjustment") {  }//OP#1530
	else if (headers[index] == "isDeleted") { ref->setIsDeleted(0 == strncmp("true", value, 4)); }
	else if (headers[index] == "ver") { ref->setVer(atoi(value)); }
	else if (headers[index] == "splitDutyRestMin") {  }
	else if (headers[index] == "properties") {  }
	else if (headers[index] == "assignment") { ref->setAssignment(value); }
	else if (headers[index] == "createdBy") { ref->setCreatedBy(value); }///
	else if (headers[index] == "createdDt") { ref->setCreatedDt(utcStrToUtc(value)); }///
	else if (headers[index] == "lastModified") { ref->setLastModified(utcStrToUtc(value)); }///
	else if (headers[index] == "modifiedBy") { ref->setModifiedBy(value); }///
	else if (headers[index] == "refTz") { ref->setRefTz(atoi(value)); }
	else if (headers[index] == "etrTz") { ref->setEtrTz(atoi(value)); }
	else if (headers[index] == "accState") { ref->setAccState(value); }
	else if (headers[index] == "strArp") { ref->setDepStation(value); }
	else if (headers[index] == "endArp") { ref->setArrStation(value); }
	else if (headers[index] == "planFdpMinutes") {}//planFdpMin
	else if (headers[index] == "actStrDtUtc") {}
	else if (headers[index] == "actEndDtUtc") {}

	else if (headers[index] == "discretionType") { 
		ref->setOriginDiscretionType(value);

		vector<std::string> discretionTypeExs;
		split(value, ',', discretionTypeExs);

		vector<std::string> discretionTypes;
		for (auto& discretionTypeEx : discretionTypeExs) {
			vector<string> splitstrs;
			split(discretionTypeEx, '-', splitstrs);
			if (splitstrs.size() >= 2) {
				discretionTypes.emplace_back(splitstrs[0]);
				ref->setManualDiscretion(splitstrs[0], atoi(splitstrs[1].c_str()));
			}
			else {
				discretionTypes.emplace_back(discretionTypeEx);
			}
		}
		
		ref->setDiscretionTypes(discretionTypes); 
	}
	else if (headers[i] == "manualFdpDiscretion") { /*ref->setManualFdpDiscretion(atoi(value)); */ }
	else if (headers[i] == "manualFtDiscretion") { /*ref->setManualFtDiscretion(atoi(value)); */ }
	else if (headers[i] == "manualRestDiscretion") { /*ref->setManualRestDiscretion(atoi(value));*/ }
	else if (headers[i] == "manualDpDiscretion") { /*ref->setManualDpDiscretion(atoi(value));*/ }
	else if (headers[i] == "manualSectorDiscretion") { /*ref->setManualSectorDiscretion(atoi(value));*/ }
	else if (headers[i] == "trainingAddTime") { ref->setTrainingAddTime(atoi(value) == 1); }

	else if (headers[index] == "comments") { ref->setComments(value); }
	else if (headers[index] == "attribute") { ref->setAttributes(value); }
	else if (headers[index] == "fdpExtensionMinutes") { ref->setFdpExtensionMinutes(atoi(value)); }
	else if (headers[index] == "crewId") {}
	else if (headers[index] == "actDpMin") {}
	else if (headers[index] == "maxFlightMin") {}
	else if (headers[index] == "actStrDtUtcLocal") {}
	else if (headers[index] == "actEndDtUtcLocal") {}
	else if (headers[index] == "assType") {}

	else if (headers[i] == "isManualMaxFdp") { ref->setIsManualMaxFdp(atoi(value) == 1); }
	
	else { logUnkonwnField("duty", headers[index]); }

}

