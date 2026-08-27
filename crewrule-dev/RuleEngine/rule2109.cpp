#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"



/*
2109 Rule包含两部分，基于duty list和segment list检查
*/
bool LegalityChecker::checkLongTransit(vector<Duty*>& duties, const vector<DBRule>& rules)
{
	bool bReturn = true;

	int maxPerPairing = RuleParams::GetInstancePtr()->r2109_maxPerPairing;
	int numberOfLongTransitInPairing = 0;
	for (auto& duty : duties)
	{
		//2109重算isLongTransit字段，保证PO中Segment出现在多条Path中的可能性和UI中改变当前Duty结构所引发的Bug
		vector<Segment*> segments = duty->getSegments();
		//RuleParams::GetInstancePtr()->getAndSetLongTransitRest(segments);

		for (int i = 0; i < (int)duty->getNumSegments() - 1; ++i)
		{
			Segment* segment = duty->getSegment(i);
			Segment* next_segment = duty->getSegment(i+1);
			//if (segment->isLongTransitWithNext())
			if (RuleParams::GetInstancePtr()->getLongTransit(segment, next_segment) != nullptr)
			{
				numberOfLongTransitInPairing++;
			}
		}
	}
	if (numberOfLongTransitInPairing > maxPerPairing)
	{
		if (this->_application == PAIRING_OPTIMIZER)
			return false;

		string errorMsg = "The number of long transits(" + Utility::GetInstancePtr()->iToa(numberOfLongTransitInPairing);
		errorMsg += " in pairing exceeds the maximum allowed(" + Utility::GetInstancePtr()->iToa(maxPerPairing) + ").";
		duties[0]->setViolationMessage(errorMsg);
		duties[0]->setLegality(false);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = duties[0]->getPairingId();
		rv->dutySequenceNumber = duties[0]->getDutySegNum();
		rv->idRule = rules[0].idRule;
		rv->startDTUtc = duties[0]->getStartTimeUtcAct();
		rv->endDTUtc = duties[0]->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("ruleId", "2109.3"));
		rv->operation_result.insert(pair<string, string>("numberOfLongTransitInPairing",Utility::GetInstancePtr()->iToa(numberOfLongTransitInPairing)));
		rv->operation_result.insert(pair<string, string>("maxPerPairing", Utility::GetInstancePtr()->iToa(maxPerPairing)));
		rv->violation_msg = errorMsg;
		this->addRuleViolations(rv, &rules[0]);
		bReturn = false;
	}

	if (this->_application != PAIRING_OPTIMIZER){
		for (auto& duty : duties)
		{
			// mantis#6176, check Duty LongTransit前,UI已经将Duty打包完成，不需要split duty
			/*bool isLegal = checkSegsInSameDuty(duty->getSegments());
			if (!isLegal){
			bReturn = false;
			break;
			}*/
			vector<Segment*> segments = duty->getSegments();
			bool bReturnInSegs = checkLongTransit(segments, rules, false);
			bReturn = bReturn && bReturnInSegs;
		}
	}

	return bReturn;
}

/* 此函数被checkLongTransit(vector<Duty*>& duties)调用，所需的segment层级的一些数据，在生成duty时被计算。但此函数也可以被独立调用，这时所需的segment
层级的一些数据，需要被计算出来。因此用一个参数isPureSegmentCheck来控制调用setLongTransitDataForSeg(vector<Segment *> segments)。*/
bool LegalityChecker::checkLongTransit(vector<Segment*>& segments, const vector<DBRule>& rules, bool isPureSegmentCheck)
{
	bool bReturn = true;
	if (rules.size() == 0)
		return true;

	//mantis#6176, 2019删除下层表，上层表由横向存储改为纵向存储；告警只保留站点和次数
	long startTime = RuleParams::GetInstancePtr()->r2109_startTime;
	long endTime = RuleParams::GetInstancePtr()->r2109_endTime;
	int iMax = RuleParams::GetInstancePtr()->r2109_maxPerDuty;
	int iNumberofLongTransit = 0;

	//if (isPureSegmentCheck)
	//	RuleParams::GetInstancePtr()->getAndSetLongTransitRest(segments);

	for (int i = 0; i < (int)segments.size() - 1; ++i)
	{
		//if (segments[i]->isLongTransitWithNext())
		if (RuleParams::GetInstancePtr()->getLongTransit(segments[i], segments[i+1]) != nullptr)

		{
			iNumberofLongTransit++; //统计duty LT次数应该与LT Time Window判断的逻辑分开
			if (!checkLongTransitStation(segments[i]->getArrSta()))
			{
				if (this->_application == PAIRING_OPTIMIZER)
					return false;

				string errorMsg = "Station: " + segments[i]->getArrSta() + " is not designated as a Long Transit Station.";
				segments[i]->setViolationMessage(errorMsg);
				segments[i]->setLegality(false);
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = segments[i]->getPairingId();
				rv->dutySequenceNumber = segments[i]->getDutySeq();
				rv->idRule = rules[0].idRule;
				rv->startDTUtc = segments[i]->getEndTimeUtcAct();
				rv->endDTUtc = segments[i + 1]->getStartTimeUtcAct();
				rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("ruleId", "2109.1"));
				rv->operation_result.insert(pair<string, string>("Airport", segments[i]->getArrSta()));
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, &rules[0]);
			}
		}
	}

	/*for (int i = 0; i < (int)segments.size() - 1; ++i)
	{
	if (segments[i]->isLongTransitWithNext())
	{
	string currType = segments[i]->getDomIntType();
	string nextType = segments[i + 1]->getDomIntType();
	if (currType != inbound || nextType != outbound)
	continue;
	int iRest = segments[i]->getLongTransitRestMins();
	if (iRest > maxRestTimeMins)
	{
	string errorMsg = "Rest (" + Utility::GetInstancePtr()->formatMinutes(iRest);
	errorMsg += ") between segments(" + segments[i]->getFlightNumber() + "-" + segments[i + 1]->getFlightNumber();
	errorMsg += ") is more than max rest(" + Utility::GetInstancePtr()->formatMinutes(maxRestTimeMins) + ").";
	segments[i]->setViolationMessage(errorMsg);
	segments[i]->setLegality(false);
	bReturn = false;
	}
	}
	}*/

	if (startTime != 0 || endTime != 24 * 60 - 1){
		for (std::size_t i = 0; i + 1 < segments.size(); ++i)
		{
			//if (segments[i]->isLongTransitWithNext())
			if (RuleParams::GetInstancePtr()->getLongTransit(segments[i], segments[i + 1]) != nullptr)
			{
				//iNumberofLongTransit++;

				//string station = segments[i]->getArrStation();
				//auto offsetMinutes = _dbData->getAirportOffsetMinutes(station);

				time_t ltStart = segments[i]->getEndTimeUtcAct();
				time_t ltEnd = segments[i + 1]->getStartTimeUtcAct();
				time_t ltStartLocal = segments[i]->getEndTimeLocAct();
				time_t ltEndLocal = segments[i + 1]->getStartTimeLocAct();
				const int SecondsInDay = 3600 * 24;
				time_t localDay = ltStartLocal - ltStartLocal % SecondsInDay;
				//TODO - 严格来说对于跨天的LT，下面逻辑可能有漏洞，待发现反例。TODO
				if (!(ltStartLocal >= localDay + startTime * 60 && ltEndLocal <= localDay + endTime * 60))
				{
					if (this->_application == PAIRING_OPTIMIZER)
						return false;

					string errorMsg = "Long transit start/end times are outside the permitted window";
					errorMsg += "(" + Utility::GetInstancePtr()->formatMinutes(startTime);
					errorMsg += " - " + Utility::GetInstancePtr()->formatMinutes(endTime) + ").";
					segments[i]->setViolationMessage(errorMsg);
					segments[i]->setLegality(false);
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = segments[i]->getPairingId();
					rv->dutySequenceNumber = segments[i]->getDutySeq();
					rv->idRule = rules[0].idRule;
					rv->startDTUtc = segments[i]->getEndTimeUtcAct();
					rv->endDTUtc = segments[i + 1]->getStartTimeUtcAct();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "2109.2"));
					rv->operation_result.insert(pair<string, string>("StartTime", utcToUtcHHMM(ltStart)));
					rv->operation_result.insert(pair<string, string>("EndTime", utcToUtcHHMM(ltEnd)));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &rules[0]);
				}
			}
		}
	}

	if (segments.size() > 0){
		if (iNumberofLongTransit > iMax)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			string errorMsg = "The number of long transits(" + Utility::GetInstancePtr()->iToa(iNumberofLongTransit);
			errorMsg += ") in the duty exceeds the maximum allowed(" + Utility::GetInstancePtr()->iToa(iMax) + ").";
			segments[0]->setViolationMessage(errorMsg);
			segments[0]->setLegality(false);
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = segments[0]->getPairingId();
			rv->dutySequenceNumber = segments[0]->getDutySeq();
			rv->idRule = rules[0].idRule;
			rv->startDTUtc = segments[0]->getStartTimeUtcAct();
			rv->endDTUtc = segments[segments.size() - 1]->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", "2109.4"));
			rv->operation_result.insert(pair<string, string>("iNumberofLongTransit", Utility::GetInstancePtr()->iToa(iNumberofLongTransit)));
			rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->iToa(iMax)));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, &rules[0]);
		}
	}
	return bReturn;
}