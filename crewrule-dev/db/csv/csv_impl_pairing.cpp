#include <sstream>
#include <algorithm>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include "Utility.h"

static bool _g_isForV2 = true;
static bool _g_isForV2_done = false;

static bool _isForV2(vector<string>& headers) {
	if (!_g_isForV2_done) {
		_g_isForV2 = find(headers.begin(), headers.end(), "filiale") == headers.end();
		_g_isForV2_done = true;
	}
	return _g_isForV2;
}


void pairingParser::init(vector<string>& headers) {}

static vector<string> pairingDefaultHeaders = { "id", "scenarioId", "label", "fleetGroup", "language", "training", "reqPoint", "qualifier", "endArp", 
"pairingDt", "perDiemMins", "perDiemMinsAdjustment", "lhPerDiemMins", "fmPerDiemMins", "fmLhPerDiemMins","blockMins", "blockMinsAdjustment", "reason", "isSplit",
"schStartDtUtc", "schEndDtUtc", "schStartDtLocal", "schEndDtLocal", "actStartDtUtc","actEndDtUtc", "actStartDtLocal", "actEndDtLocal",//"actStartDtUtc" = "actStrDtUtc"
"isLegal", "isAugment", "region", "division", "base", "numberOfDaysToTakeAwayFromBase", "attributes", 
"durationInDays", "durationInHours", "primeActivityType", "comments", "fatigue", "preference",
"wpMins", "wpMinsAdjustment", "isDeleted", "ver", "liveId", "rankCombCriteriaId","courseCode","courseType","createdBy","createdDt","ggyBlh",
"source","lastModified","modifiedBy","tagForRequest","tags","tagSet", // ROSCRW-3855 source
// 3.0 
 "assignment", "assignmentGroup", "durationDays", "tafb", "filiale", "fleet", "schStrDtUtc", "rankCombC9aP", "rankCombC9aC", "rankCombC9aA", "rankCombOptionP", "rankCombOptionC", "rankCombOptionA", "interfaceId",
"schPerDiemMins", "schLhPerDiemMins", "schFmPerDiemMins", "schFmLhPerDiemMins","schWpMins", "minATDO", "minEXDO" };
vector<string>& pairingParser::getDefaultHeaders() {
	return pairingDefaultHeaders;
}

void* pairingParser::createInstance() {
	return new Pairing();
}

void pairingParser::deleteInstance(void* obj) {
	delete (Pairing*)obj;
}

string pairingParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Pairing * ref = (Pairing *)obj;
	auto lastDuty = ref->getLastDuty();
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getDbId() << "^"; }
		else if (headers[i] == "schId") { ss << ref->getScenarioId() << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->getScenarioId() << "^"; }
		else if (headers[i] == "label") { ss << ref->getLabel() << "^"; }
		else if (headers[i] == "isLegal") { ss << 1 << "^"; }
		else if (headers[i] == "isAugment") { ss << 0 << "^"; }
		else if (headers[i] == "fleetGrp") { ss << ref->getFltCode() << "^"; }///
		else if (headers[i] == "fleet") { ss << ref->getFltCode() << "^"; }///
		else if (headers[i] == "fleetGroup") { ss << ref->getFltCode() << "^"; }///
		else if (headers[i] == "language") { ss << "^"; }///
		else if (headers[i] == "training") { ss << "^"; }///
		else if (headers[i] == "reqPoint") { ss << "^"; }///
		else if (headers[i] == "qualifier") { ss << ref->getQualifier() << "^"; }///
		else if (headers[i] == "endArp") { ss << ref->getEndArp() << "^"; }///
		//20210708 ain, mantis#9370, csv pairing_dt 2.0/3.0相同输出格式，按 yyyyMMdd
		else if (headers[i] == "pairingDt") { ss << utcToUtcDtString(ref->getStartTimeLocSch()) << "^"; }
		else if (headers[i] == "perDiemMins") { ss << Utility::round(ref->getPerDiemInSec() * 1.0 / 60, 2) <<"^"; }///PerDiem(实际时间)
		else if (headers[i] == "perDiemMinsAdjustment") { ss << Utility::round(ref->getPerDiemAdjustmentInSec() * 1.0 / 60, 2) << "^"; }///PerDiem调整值(实际时间)

		else if (headers[i] == "lhPerDiemMins") { ss << Utility::round(ref->getLongPerDiemInSec() * 1.0 / 60, 2) << "^"; }///Long PerDiem(实际时间)
		else if (headers[i] == "fmPerDiemMins") { ss << Utility::round(ref->getFirstMonthPerDiemInSec() * 1.0 / 60, 2) << "^"; }///PerDiem首月(实际时间)
		else if (headers[i] == "fmLhPerDiemMins") { ss << Utility::round(ref->getFirstMonthLongPerDiemInSec() * 1.0 / 60, 2) << "^"; }///Long PerDiem首月(实际时间)
		//////
		else if (headers[i] == "schPerDiemMins") { ss << Utility::round(ref->getPerDiemInSec() * 1.0 / 60, 2) << "^"; }///PerDiem(计划时间)

		else if (headers[i] == "schLhPerDiemMins") { ss << Utility::round(ref->getLongPerDiemInSec() * 1.0 / 60, 2) << "^"; }///Long PerDiem(计划时间)
		else if (headers[i] == "schFmPerDiemMins") { ss << Utility::round(ref->getFirstMonthPerDiemInSec() * 1.0 / 60, 2) << "^"; }///PerDiem首月(计划时间)
		else if (headers[i] == "schFmLhPerDiemMins") { ss << Utility::round(ref->getFirstMonthLongPerDiemInSec() * 1.0 / 60, 2) << "^"; }///Long PerDiem首月(计划时间)
		
		else if (headers[i] == "blockMins") { ss << "^"; }///
		else if (headers[i] == "blockMinsAdjustment") { ss << ref->getBlockMinsAdjustment() << "^"; }///
		else if (headers[i] == "reason") { ss << "^"; }///
		else if (headers[i] == "isSplit") { ss << "^"; }///
		else if (headers[i] == "filiale") { ss << ref->getFiliale() << "^"; }///
		else if (headers[i] == "createdBy") { ss << ref->getCreatedBy() << "^"; }///
		else if (headers[i] == "createdDt") { ss << utcToUtcTzString(ref->getCreatedDt()) << "^"; }///
		else if (headers[i] == "lastModified") { ss << utcToUtcTzString(ref->getLastModified()) << "^"; }///
		else if (headers[i] == "modifiedBy") { ss << ref->getModifiedBy() << "^"; }///

		else if (headers[i] == "schStrDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcSch()) << "^"; }///
		else if (headers[i] == "schStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocSch()) << "^"; }///
		else if (headers[i] == "schEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocSch()) << "^"; }///
		else if (headers[i] == "actStartDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcAct()) << "^"; }///actStrDtUtc
		else if (headers[i] == "actEndDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcAct()) << "^"; }///
		else if (headers[i] == "actStartDtLocal") { ss << utcToUtcTzString(ref->getStartTimeLocAct()) << "^"; }///
		else if (headers[i] == "actEndDtLocal") { ss << utcToUtcTzString(ref->getEndTimeLocAct()) << "^"; }///

		else if (headers[i] == "region") { ss << ref->getRegion() << "^"; }
		else if (headers[i] == "division") { ss << ref->getDivision() << "^"; }
		else if (headers[i] == "base") { ss << ref->getBase() << "^"; }
		//20180823 ain, mantis#3744, pairing.tafb = lastDuty.START - firstDuty.end
		//20190506 ain, mantis#5420, pairing.tafb计算与 durationDays统一
		else if (headers[i] == "numberOfDaysToTakeAwayFromBase" || headers[i] == "tafb") {
			if (ref->getNumDuties() == 0)
				ss << 0 << "^";
			else {
				Duty * firstDuty = ref->getDuty(0);
				Duty * lastDuty = ref->getDuty(ref->getNumDuties() - 1);
				ss << 1 + ((getStartTimeOfDay(lastDuty->getStartTimeLocSch()) - getStartTimeOfDay(firstDuty->getStartTimeLocSch())) / (24 * 3600)) << "^";
			}
			
		}
		else if (headers[i] == "attributes") { ss << ref->getAttribute() << "^"; }
		//20181120 ain, mantis#4468, pairing.durationDays = 1 + lastDuty.START - 1stDuty.START
		else if (headers[i] == "durationInDays" || headers[i] == "durationDays") {
			if (ref->getNumDuties() == 0)
				ss << 0 << "^";
			else {
				Duty * firstDuty = ref->getDuty(0);
				Duty * lastDuty = ref->getDuty(ref->getNumDuties() - 1);
				ss << 1 + ((getStartTimeOfDay(lastDuty->getStartTimeLocSch()) - getStartTimeOfDay(firstDuty->getStartTimeLocSch())) / (24 * 3600)) << "^";
			}
		}
		else if (headers[i] == "durationInHours") { ss << ((int)ref->getDurationHrs()) << "^"; }
		else if (headers[i] == "primeActivityType") { ss << ref->getPrimeActivity() << "^"; }
		else if (headers[i] == "primeActivity") { ss << ref->getPrimeActivity() << "^"; }
		else if (headers[i] == "assignment") { ss << ref->getQualifier() << "^"; }
		else if (headers[i] == "assignmentGroup") { ss << ref->getPrimeActivity() << "^"; }///20200615 ain, mantis#8414 #24
		else if (headers[i] == "comments") { ss << ref->getComments() << "^"; }
		else if (headers[i] == "fatigue") { ss << ref->getTotalFatiguePoints() << "^"; }
		else if (headers[i] == "preference") { 
			auto iter = this->pairingPreferenceMap.find(ref->getDbId());
			if (iter == this->pairingPreferenceMap.end()) {
				ss << "^";
			}
			else {
				ss << this->pairingPreferenceMap[ref->getDbId()] << "^"; 
			}
		}

		else if (headers[i] == "wpMins") { ss << Utility::round(ref->getWorkPeriodInSec() * 1.0 / 60, 2) <<"^"; } //Work Hour(实际时间)
		else if (headers[i] == "wpMinsAdjustment") { ss << Utility::round(ref->getWorkPeriodAdjustmentInSec() * 1.0 / 60, 2) << "^"; }//Work Hour调整值(实际时间)
		else if (headers[i] == "schWpMins") { ss << Utility::round(ref->getSchWorkPeriodInSec() * 1.0 / 60, 2) << "^"; }//Work Hour(计划时间)
		else if (headers[i] == "isDeleted") { ss << (ref->isDeleted() ? "true" : "false") << "^"; }
		else if (headers[i] == "ver") { ss << "^"; }

		else if (headers[i] == "liveId") { ss << ref->getLiveId() << "^"; }                   //20180827 ain, OP#1395, new field 'liveId‘
		else if (headers[i] == "rankCombCriteriaId") { ss << ref->getRankCombCriteriaId() << "^"; } //20180920

		//3.0
		else if (headers[i] == "rankCombC9aP") { ss << ref->getRankCombCP() << "^"; } 
		else if (headers[i] == "rankCombC9aC") { ss << ref->getRankCombCC() << "^"; }
		else if (headers[i] == "rankCombC9aA") { ss << ref->getRankCombCA() << "^"; }
		else if (headers[i] == "rankCombOptionP") { ss << ref->getRankCombOP() << "^"; }
		else if (headers[i] == "rankCombOptionC") { ss << ref->getRankCombOC() << "^"; }
		else if (headers[i] == "rankCombOptionA") { ss << ref->getRankCombOA() << "^"; }
		else if (headers[i] == "interfaceId") { ss << ref->getInterfaceId() << "^"; }
        else if (headers[i] == "source") { ss << ref->GetSource() << "^"; }
		else if (headers[i] == "ggyBlh") { ss << ref->getGgyBlh() << "^"; }
		else if (headers[i] == "tafb") { ss << ref->getTafb() << "^"; }
		else if (headers[i] == "tagForRequest") { ss << ref->getTagForRequest() << "^"; }
		else if (headers[i] == "tags") { ss << ref->getTags() << "^"; }
		else if (headers[i] == "tagSet") { ss << ref->getTagSet() << "^"; }
		else if (headers[i] == "ver") { ss << ref->getVer() << "^"; }
		else if (headers[i] == "courseCode") { ss << ref->GetCourseCode() << "^"; }
		else if (headers[i] == "courseType") { ss << ref->GetCourseType() << "^"; }
		else if (headers[i] == "minATDO") {
			int minATDO = 0;
			if (lastDuty != nullptr) {
				minATDO = lastDuty->getMinATDO();
			}
			ss << minATDO << "^";
		}
		else if (headers[i] == "minEXDO") { 
			int minEXDO = 0;
			if (lastDuty != nullptr) {
				minEXDO = lastDuty->getMinEXDO();
			}
			ss << minEXDO << "^";
		}
		else { logUnkonwnField("pairing", headers[i]); }
	}
	return ss.str();
}

void pairingParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Pairing * ref = (Pairing *)obj;
	if (headers[index] == "id") { ref->setDbId(atoll(value)) ; }
	else if (headers[index] == "scenarioId") { ref->setScenarioId(atoll(value)); }
	else if (headers[index] == "label") { ref->setLabel(value) ; }
	else if (headers[index] == "isLegal") { }
	else if (headers[index] == "isAugment") { }
	else if (headers[index] == "fleetGrp") { string val = value; ref->setFltCode(val); }///
	else if (headers[index] == "fleet") { string val = value; ref->setFltCode(val); }//3.0
	else if (headers[index] == "fleetGroup") { string val = value; ref->setFltCode(val); }///
	else if (headers[index] == "language") { }///
	else if (headers[index] == "training") {}///
	else if (headers[index] == "reqPoint") {}///
	else if (headers[index] == "endArp") { ref->setEndArp(value);  }///
	else if (headers[index] == "pairingDt") { }///实时计算后输出
	else if (headers[index] == "perDiemMins") { ref->setPerDiemInSec((int)(atof(value) * 60)); }//PerDiem Hour(实际时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "perDiemMinsAdjustment") { ref->setPerDiemAdjustmentInSec((int)(atof(value) * 60)); }//PerDiem调整时长(实际时间)

	else if (headers[index] == "lhPerDiemMins") { ref->setLongPerDiemInSec((int)(atof(value) * 60)); }//Long PerDiem Hour(长PH)(实际时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "fmPerDiemMins") { ref->setFirstMonthPerDiemInSec((int)(atof(value)*60)); }//splited first Month PerDiem Hour(跨月第一个月PH分钟数)(实际时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "fmLhPerDiemMins") { ref->setFirstMonthLongPerDiemInSec((int)(atof(value) * 60)); }//splited first Month Long PerDiem Hour(跨月第一个月LPH分钟数)(实际时间)。单位分钟，浮点保留二位小数
	
	else if (headers[index] == "schPerDiemMins") { ref->setSchPerDiemInSec((int)(atof(value) * 60)); }//PerDiem Hour(长PH)(计划时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "schLhPerDiemMins") { ref->setSchLongPerDiemInSec((int)(atof(value) * 60)); }//Long PerDiem Hour(长PH)(计划时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "schFmPerDiemMins") { ref->setSchFirstMonthPerDiemInSec((int)(atof(value) * 60)); }//splited first Month PerDiem Hour(跨月第一个月PH分钟数)(计划时间)。单位分钟，浮点保留二位小数
	else if (headers[index] == "schFmLhPerDiemMins") { ref->setSchFirstMonthLongPerDiemInSec((int)(atof(value) * 60)); }//splited first Month Long PerDiem Hour(跨月第一个月LPH分钟数)(计划时间)。单位分钟，浮点保留二位小数

	else if (headers[index] == "blockMins") {}///
	else if (headers[index] == "blockMinsAdjustment") { ref->setBlockMinsAdjustment(atoi(value)); }///
	else if (headers[index] == "reason") {}///
	else if (headers[index] == "isSplit") {}///
	else if (headers[index] == "filiale") {
		_isForV2(headers);
		string val = value;ref->setFiliale(val);
	}///
	else if (headers[index] == "tafb") { ref->setTafb(atoi(value)); }///
	else if (headers[index] == "createdBy") { ref->setCreatedBy(value); }///
	else if (headers[index] == "createdDt") { ref->setCreatedDt(utcStrToUtc(value)); }///
	else if (headers[index] == "lastModified") { ref->setLastModified(utcStrToUtc(value));	}///
	else if (headers[index] == "modifiedBy") { ref->setModifiedBy(value); }///

	else if (headers[index] == "schStrDtUtc") { ref->setStartTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schStartDtUtc") {}///
	else if (headers[index] == "schEndDtUtc") { ref->setEndTimeUtcSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schStartDtLocal") { ref->setStartTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "schEndDtLocal") { ref->setEndTimeLocSch(utcStrToUtc(value)); }///
	else if (headers[index] == "actStrDtUtc") { ref->setStartTimeUtcAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actStartDtUtc") {} //actStrDtUtc
	else if (headers[index] == "actEndDtUtc") { ref->setEndTimeUtcAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actStartDtLocal") { ref->setStartTimeLocAct(utcStrToUtc(value)); }///
	else if (headers[index] == "actEndDtLocal") { ref->setEndTimeLocAct(utcStrToUtc(value)); }///

	else if (headers[index] == "region") { ref->setRegion(value) ; }
	else if (headers[index] == "division") { ref->setDivision(value) ; }
	else if (headers[index] == "base") { ref->setBase(string(value)) ; }
	else if (headers[index] == "numberOfDaysToTakeAwayFromBase") {  }
	else if (headers[index] == "attributes") { ref->setAttribute(string(value)); }
	else if (headers[index] == "durationDays") {}
	else if (headers[index] == "durationInDays") {}
	else if (headers[index] == "durationInHours") { ; }
	else if (headers[index] == "assignment") { ref->setQualifier(value); }
	else if (headers[index] == "qualifier") { ref->setQualifier(value); }///

	else if (headers[index] == "primeActivityType") { ref->setPrimeActivity(string(value)); }
	else if (headers[index] == "primeActivity") { ref->setPrimeActivity(string(value)); }
	else if (headers[index] == "assignmentGroup") { ref->setPrimeActivity(string(value)); } ///20200615 ain, mantis#8414 #24
	else if (headers[index] == "comments") { ref->setComments(string(value)); }
	else if (headers[index] == "fatigue") { ref->setTotalFatiguePoints(atof(value)); }
	else if (headers[index] == "preference") { this->pairingPreferenceMap[ref->getDbId()] = value; }

	else if (headers[index] == "wpMins") { ref->setWorkPeriodInSec((int)(atof(value) * 60)); }//Work Hour(实际时间)
	else if (headers[index] == "wpMinsAdjustment") { ref->setWorkPeriodAdjustmentInSec((int)(atof(value) * 60)); }//Work Hour调整值(实际时间)
	else if (headers[index] == "schWpMins") { ref->setSchWorkPeriodInSec((int)(atof(value) * 60)); }//Work Hour(计划时间)
	else if (headers[index] == "tags") { ref->setTags(value); }
	else if (headers[index] == "isDeleted") { ref->setIsDeleted(0 == strncmp("true", value, 4)); }
	else if (headers[index] == "ver") { ref->setVer(atoi(value)); }
	else if (headers[index] == "liveId") { ref->setLiveId(atoll(value)); }                 //20180827 ain, OP#1395, new field 'liveId‘
	else if (headers[index] == "rankCombCriteriaId") { ref->setRankCombCriteriaId(atoll(value)); } //20180920
	else if (headers[index] == "rankCombC9aP") { ref->setRankCombCP(atoll(value)); } //3.0
	else if (headers[index] == "rankCombC9aC") { ref->setRankCombCC(atoll(value)); } //3.0
	else if (headers[index] == "rankCombC9aA") { ref->setRankCombCA(atoll(value)); } //3.0
	else if (headers[index] == "rankCombO9aP") { ref->setRankCombOP(value); } //3.0
	else if (headers[index] == "rankCombO9aC") { ref->setRankCombOC(value); } //3.0
	else if (headers[index] == "rankCombO9aA") { ref->setRankCombOA(value); } //3.0
	else if (headers[index] == "actStrDtUtc") {}
	else if (headers[index] == "actEndDtUtc") {}
	else if (headers[index] == "interfaceId") { ref->setInterfaceId(value); }
	else if (headers[index] == "ggyBlh") { ref->setGgyBlh(atoi(value)); }
	else if (headers[index] == "source") { ref->SetSource(value); }

	else if (headers[index] == "tagForRequest") { ref->setTagForRequest(value); }
	else if (headers[index] == "tagSet") { ref->setTagSet(value); }
	else if (headers[index] == "courseCode") { ref->SetCourseCode(value); }
	else if (headers[index] == "courseType") { ref->SetCourseType(value); }
	else if (headers[index] == "actionDtUtc") {}
	else if (headers[index] == "schCreditedMinutes") {}
	else if (headers[index] == "fmCreditedMinutes") {}
	else if (headers[index] == "schFmCreditedMinutes") {}
	else if (headers[index] == "minATDO") {}
	else if (headers[index] == "minEXDO") {}
	else { logUnkonwnField("pairing", headers[index]); }

}

