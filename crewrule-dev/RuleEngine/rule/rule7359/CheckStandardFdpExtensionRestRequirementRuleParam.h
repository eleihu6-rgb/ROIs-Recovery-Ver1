/**
 * @file CheckStandardFdpExtensionRestRequirementRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULEPARAM_H_
#define _CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "../period/BaseActivityPeriod.h"



class CheckStandardFdpExtensionRestRequirementRule;

class CheckStandardFdpExtensionRestRequirementRuleParam : public RuleParam {
	friend class CheckStandardFdpExtensionRestRequirementRule;
private:
	explicit CheckStandardFdpExtensionRestRequirementRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7359;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 7;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		MAX_DUTY_FATIGUE = 4,
		FATIGUE_DISCRETION = 5,
		FATIGUE_DISCRETION_ATTRIBUTES = 6
	};

	//Crew的基地列表，支持|分开多个设置和*通配符
	std::vector<std::string> _bases{};
	//Crew的Rank列表，支持|分开多个设置和*通配符
	std::vector<std::string> _ranks{};
	//Crew的Fleet列表，支持|分开多个设置和*通配符
	std::vector<std::string> _fleets{};
	//Crew的Team列表，支持|分开多个设置和*通配符
	std::vector<std::string> _teams{};
	//Crew的Team列表，支持 * 通配符和 | 分开多个设置
	std::vector<std::string> _compositions{};
	//同CMSCEB15, Duty层次的标签，支持 * 通配符（任意标签或者无标签）和 | 多个分开设置，为空则代表没有Duyt标签
	std::vector<std::string> _overrideDutyAttributes{};
	// 【ROSCRW-18845】【TG】【RULE】修改7359法规 支持设置多个EXTENDED REST DISTRIBUTION
	//拓展休時分布，支持 | 多值按顺序 OR 校验（如 AFTER|BOTH）；* 通配符代表任一侧满足即可
	//BOTH - 前后均分或任务后全额；BEFORE/AFTER - 对应侧满足 Rest Extention；* - 前后任一侧满足即可
	std::vector<std::string> _extendedRestDistributions{};
	//休時拓展，格式hh:mm
	int _restExtention{};

	void ParseParam(const DBRule& dbRule);

	// 【ROSCRW-18845】【TG】【RULE】修改7359法规 支持设置多个EXTENDED REST DISTRIBUTION
	bool CheckExtendedRestDistributionForMode(const std::string& mode,
		time_t prevDutyRestEndTime,
		time_t nextDutyStartTime,
		time_t currentDutyStartTime,
		time_t currentDutyEndTime) const;


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchDutyAttributes(const Duty* duty) const;

	bool MatchComposition(const Duty* duty) const;

	bool MatchRuleParam(const Duty* duty) const;

	bool CheckExtendedRestDistribution(const shared_ptr<BaseActivityPeriod>& prevActivity, const shared_ptr<BaseActivityPeriod>& nextActivity, const Duty* duty) const;
};

#endif //_CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULEPARAM_H_
