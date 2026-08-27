/**
 * @file CheckPassportAndVisaForEvaFdRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKPASSPORTANDVISAFOREVAFDRULEPARAM_H_
#define _CHECKPASSPORTANDVISAFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckPassportAndVisaForEvaFdRule;

class CheckPassportAndVisaForEvaFdRuleParam : public RuleParam {
	friend class CheckPassportAndVisaForEvaFdRule;
private:
	explicit CheckPassportAndVisaForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7229;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		NATIONALITIES = 4,
		QUALIFICATION_OR_CERTIFICATE = 5,
		DAY_ASSIGNMENT_CODE = 6,
		GAP_DAYS = 7,
		IS_QUAL_EXPIRED = 8, 
		PROHIBITED_COUNTRIES = 9,
		PROHIBITED_ASSIGNMENTS = 10,
		PROHIBITED_ASSIGNMENT_GROUPS = 11,
		ONLY_CHECK_LAYOVER = 12,
		PROHIBITED_LAYOVER_AIRPORTS = 13,
		PROHIBITED_LAYOVER_COUNTRIES = 14,
		PROHIBITED_AIRPORTS = 15,
		GAP_DAYS_WITHOUT_HOLIDAY = 16,
		HOLIDAY_COUNTRIES = 17
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	//国籍,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _nationalities{};
	//资质或者证件
	std::string _qualification{};
	//除外国籍，多个值使用“|”，ex：!(CN)
	std::vector<std::string> _exceptNationalities{};
	//更新证照的任务代码
	std::string _dayAssignmentCode{};
	//更新天数
	int _gapDays{};
	//资质是否过期。判断MC任务是否安排在MCC资质过期后，如果是过期前，则不需要启用GAP day范围的任务限制；如果是过期后，则需要启用GAP DAY范围的任务限制。
	std::shared_ptr<bool> _isQualExpired{ nullptr };
	//禁止飞的国家
	std::vector<std::string> _prohibitedCountries{};
	//除外的禁飞国家
	std::vector<std::string> _exceptProhibitedCountries{};
	//禁止飞的任务类型
	std::vector<std::string> _prohibitedAssignments{};
	//禁止飞的任务组
	std::vector<std::string> _prohibitedAssignmentGroups{};
	//禁止飞的机场
	std::vector<std::string> _prohibitedAirports{};
	//除外的禁飞机场
	std::vector<std::string> _exceptProhibitedAirports{};
	//是否只检查过夜，Y表示禁止过夜，*不检查
	std::string _onlyCheckLayover{};
	//禁止过夜的国家,*不检查
	std::vector<std::string> _prohibitedLayoverCountries{};
	//禁止过夜的机场，*不检查
	std::vector<std::string> _prohibitedLayoverAirports{};
	//更新天数是否包含节假日和周末
	bool _gapDaysWithoutHoliday{};
	//国家
	std::vector<std::string> _holidayCountries{};
	

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchAssignmentCode(const ROSTER* roster) const;

	bool MatchSegmentParam(const Segment* segment) const;

	bool MatchAssignmentParam(const std::string assignment) const;

	bool MatchLayoverParam(const Pairing* pairing) const;

	//是否仅针对资质过期才约束Gap Days不能安排任务, true-资质过期后Gap Days不能安排任务，false-资质未过期Gap Days不能安排任务
	bool MatchQualExpiredParam(const bool isQualExpired) const;

};

#endif //_CHECKPASSPORTANDVISAFOREVAFDRULEPARAM_H_
