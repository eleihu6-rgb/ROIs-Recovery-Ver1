#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"


bool LegalityChecker::checkAirportRestrict(vector<Segment*>& segments)
{
	bool bReturn = true;
	vector<string>& noLayovers = RuleParams::GetInstancePtr()->noLayovers;
	vector<string>& noLongTransits = RuleParams::GetInstancePtr()->noLongTransits;
	vector<string>& noACChanges = RuleParams::GetInstancePtr()->noACChanges;

	vector<string>& allowLayovers = RuleParams::GetInstancePtr()->allowLayovers;
	vector<string>& allowLongTransits = RuleParams::GetInstancePtr()->allowLongTransits;
	vector<string>& allowACChanges = RuleParams::GetInstancePtr()->allowACChanges;
	/*
	allowAllAirportInLayover和noLayovers，是一般和特殊之间的关系。其他同理
	2019设置意义描述：*为通用设置，具体机场设置为特例。
	如设置：*，N，N，N CKG,Y,Y,Y 表示，CKG不允许换机/长中转/过夜，其他机场允许。
	如设置：*，Y，Y，Y CKG,N,N,N 表示，CKG允许换机/长中转/过夜，其他机场不允许
	*/

	//检查末个Segment的DepStation是否是allowLayover
	string layover = segments[segments.size() - 1]->getArrStation();

	if ((std::find(noLayovers.begin(), noLayovers.end(), layover) != noLayovers.end()) ||
		((std::find(allowLayovers.begin(), allowLayovers.end(), layover) == allowLayovers.end())
		&&
		(RuleParams::GetInstancePtr()->restrictAllAirportInLayover == "Y")))
	{
		if (this->_application == PAIRING_OPTIMIZER)
			return false;

		bReturn = false;
		string errorMsg = "The Last Segment Layover station(" + layover + ") is not permitted.";
		segments[segments.size() - 1]->setViolationMessage(errorMsg);
		segments[segments.size() - 1]->setLegality(false);

		if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
			return false;
		auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = segments[segments.size() - 1]->getPairingId();
		rv->dutySequenceNumber = -1;
		rv->idRule = 2019;
		rv->startDTUtc = segments[segments.size() - 1]->getStartTimeUtcAct();
		rv->endDTUtc = segments[segments.size() - 1]->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
		rv->violation_msg = errorMsg;
		this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
	}
	//检查首个Segment的DepStation是否是allowLayover
	layover = segments[0]->getDepStation();
	if ((std::find(noLayovers.begin(), noLayovers.end(), layover) != noLayovers.end()) ||
		((std::find(allowLayovers.begin(), allowLayovers.end(), layover) == allowLayovers.end())
		&&
		(RuleParams::GetInstancePtr()->restrictAllAirportInLayover == "Y")))
	{
		if (this->_application == PAIRING_OPTIMIZER)
			return false;

		bReturn = false;
		string errorMsg = "The First Segment Layover station(" + layover + ") is not permitted.";
		segments[0]->setViolationMessage(errorMsg);
		segments[0]->setLegality(false);

		if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
			return false;
		auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = segments[0]->getPairingId();
		rv->dutySequenceNumber = -1;
		rv->idRule = 2019;
		rv->startDTUtc = segments[0]->getStartTimeUtcAct();
		rv->endDTUtc = segments[0]->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
		rv->violation_msg = errorMsg;
		this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
	}
	//对于每个Segment的Long transit station和AC change进行检查
	for (std::size_t j = 0; j < segments.size(); ++j)
	{
		string arr = segments[j]->getArrStation();
		Segment* next_seg = j + 1 >= segments.size() ? nullptr : segments[j + 1];
		//if (segments[j]->isLongTransitWithNext())
		if (next_seg && RuleParams::GetInstancePtr()->getLongTransit(segments[j], next_seg) != nullptr)
		{
			if ((std::find(noLongTransits.begin(), noLongTransits.end(), arr) != noLongTransits.end()) ||
				((std::find(allowLongTransits.begin(), allowLongTransits.end(), arr) == allowLongTransits.end())
				&&
				(RuleParams::GetInstancePtr()->restrictAllAirportInLongTransit == "Y")))
			{
				if (this->_application == PAIRING_OPTIMIZER)
					return false;

				bReturn = false;
				string errorMsg = "The Long Transit station(" + arr + ") is not permitted.";
				segments[j]->setViolationMessage(errorMsg);
				segments[j]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = segments[j]->getPairingId();
				rv->dutySequenceNumber = -1;
				rv->idRule = 2019;
				rv->startDTUtc = segments[j]->getStartTimeUtcAct();
				rv->endDTUtc = segments[j]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
			}
		}

		if (j < segments.size() - 1)
		{
			string currentAC = segments[j]->getTailNum();
			string nextAC = segments[j + 1]->getTailNum();
			bool changeAc = true;
			if (((currentAC == nextAC) && !currentAC.empty() && !nextAC.empty()) ||
				((segments[j]->getNextLegNo() == segments[j + 1]->getSegNumber()) && !(segments[j]->getNextLegNo().empty()) && !(segments[j + 1]->getNextLegNo().empty())))
				changeAc = false;
			if (changeAc)
			{
				if ((std::find(noACChanges.begin(), noACChanges.end(), arr) != noACChanges.end()) ||
					((std::find(allowACChanges.begin(), allowACChanges.end(), arr) == allowACChanges.end())
					&&
					(RuleParams::GetInstancePtr()->restrictAllAirportInACChange == "Y")))
				{
					if (this->_application == PAIRING_OPTIMIZER)
						return false;

					bReturn = false;
					string errorMsg = "The Aircraft Change station(" + arr + ") is not permitted.";
					segments[j]->setViolationMessage(errorMsg);
					segments[j]->setLegality(false);

					if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
						return false;
					auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = segments[j]->getPairingId();
					rv->dutySequenceNumber = -1;
					rv->idRule = 2019;
					rv->startDTUtc = segments[j]->getStartTimeUtcAct();
					rv->endDTUtc = segments[j]->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
				}
			}

		}
	}

	return bReturn;
}


bool LegalityChecker::checkAirportRestrict(vector<Duty*>& duties)
{
	bool bReturn = true;
	vector<string>& noLayovers = RuleParams::GetInstancePtr()->noLayovers;
	vector<string>& noLongTransits = RuleParams::GetInstancePtr()->noLongTransits;
	vector<string>& noACChanges = RuleParams::GetInstancePtr()->noACChanges;

	vector<string>& allowLayovers = RuleParams::GetInstancePtr()->allowLayovers;
	vector<string>& allowLongTransits = RuleParams::GetInstancePtr()->allowLongTransits;
	vector<string>& allowACChanges = RuleParams::GetInstancePtr()->allowACChanges;
	/*
	allowAllAirportInLayover和noLayovers，是一般和特殊之间的关系。其他同理
	2019设置意义描述：*为通用设置，具体机场设置为特例。
	如设置：*，N，N，N CKG,Y,Y,Y 表示，CKG不允许换机/长中转/过夜，其他机场允许。
	如设置：*，Y，Y，Y CKG,N,N,N 表示，CKG允许换机/长中转/过夜，其他机场不允许
	*/
	for (std::size_t i = 0; i < duties.size(); ++i)
	{
		if (i < duties.size() - 1)
		{
			string layover = duties[i]->getArrStation();

			if ((std::find(noLayovers.begin(), noLayovers.end(), layover) != noLayovers.end()) ||
				((std::find(allowLayovers.begin(), allowLayovers.end(), layover) == allowLayovers.end())
				&&
				(RuleParams::GetInstancePtr()->restrictAllAirportInLayover == "Y")))
			{
				if (this->_application == PAIRING_OPTIMIZER)
					return false;
				bReturn = false;
				string errorMsg = "The Layover station(" + layover + ") is not permitted.";
				duties[i]->setViolationMessage(errorMsg);
				duties[i]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[i]->getPairingId();
				rv->dutySequenceNumber = duties[i]->getDutySegNum();
				rv->idRule = 2019;
				rv->startDTUtc = duties[i]->getStartTimeUtcAct();
				rv->endDTUtc = duties[i]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
			}
		}

		vector<Segment*> segments = duties[i]->getSegments();
		for (std::size_t j = 0; j < segments.size(); ++j)
		{
			string arr = segments[j]->getArrStation();
			Segment* next_seg = j + 1 >= segments.size() ? nullptr : segments[j + 1];
			//if (segments[j]->isLongTransitWithNext())
			if (next_seg && RuleParams::GetInstancePtr()->getLongTransit(segments[j], next_seg) != nullptr)
			{
				if ((std::find(noLongTransits.begin(), noLongTransits.end(), arr) != noLongTransits.end()) ||
					((std::find(allowLongTransits.begin(), allowLongTransits.end(), arr) == allowLongTransits.end())
					&&
					(RuleParams::GetInstancePtr()->restrictAllAirportInLongTransit == "Y")))
				{
					if (this->_application == PAIRING_OPTIMIZER)
						return false;

					bReturn = false;
					string errorMsg = "The Long Transit station(" + arr + ") is not permitted.";
					segments[j]->setViolationMessage(errorMsg);
					segments[j]->setLegality(false);

					if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
						return false;
					auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = duties[i]->getPairingId();
					rv->dutySequenceNumber = duties[i]->getDutySegNum();
					rv->idRule = 2019;
					rv->startDTUtc = duties[i]->getStartTimeUtcAct();
					rv->endDTUtc = duties[i]->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
				}
			}

			if (j < segments.size() - 1)
			{
				string currentAC = segments[j]->getTailNum();
				string nextAC = segments[j + 1]->getTailNum();
				bool changeAc = true;
				if (((currentAC == nextAC) && !currentAC.empty()) ||
					((segments[j]->getNextLegNo() == segments[j + 1]->getSegNumber()) && !(segments[j]->getNextLegNo().empty())))
					changeAc = false;
				if (changeAc)
				{
					if ((std::find(noACChanges.begin(), noACChanges.end(), arr) != noACChanges.end()) ||
						((std::find(allowACChanges.begin(), allowACChanges.end(), arr) == allowACChanges.end())
						&&
						(RuleParams::GetInstancePtr()->restrictAllAirportInACChange == "Y")))
					{
						if (this->_application == PAIRING_OPTIMIZER)
							return false;

						bReturn = false;
						string errorMsg = "The Aircraft Change station(" + arr + ") is not permitted.";
						segments[j]->setViolationMessage(errorMsg);
						segments[j]->setLegality(false);

						if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
							return false;
						auto& rules = _dbData->getRuleFunctions(AIRPORT_RESTRICT);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = duties[i]->getPairingId();
						rv->dutySequenceNumber = duties[i]->getDutySegNum();
						rv->idRule = 2019;
						rv->startDTUtc = duties[i]->getStartTimeUtcAct();
						rv->endDTUtc = duties[i]->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
						rv->violation_msg = errorMsg;
						this->addRuleViolations(rv, rules.empty() ? nullptr : &rules[0]);
					}
				}

			}
		}
	}

	return bReturn;
}
