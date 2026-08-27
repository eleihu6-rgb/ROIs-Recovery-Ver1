/**
 * @file TrainingBriefAndDebriefForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _TRAININGBRIEFANDDEBRIEFFOREVAFDRULEPARAM_H_
#define _TRAININGBRIEFANDDEBRIEFFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"


#include <string>
#include <limits>

class CalculateTrainingBriefAndDebriefForEvaFdRule;
class CheckTrainingBriefAndDebriefForEvaFdRule;


class TrainingBriefAndDebriefForEvaFdRuleParam : public RuleParam {
friend class CalculateTrainingBriefAndDebriefForEvaFdRule;
friend class CheckTrainingBriefAndDebriefForEvaFdRule;
private:
    explicit TrainingBriefAndDebriefForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7228;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		TYPE = 4,
		SEVERITY = 5
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//检查类型，取值：BRIEF_DEBRIEF 签到和签出
	std::string _type;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);
public:

	//匹配参数
	bool MatchParam(const Pairing* pairing, const Duty* duty, const ROSTER* roster) const;

	//匹配参数
	bool MatchParam(const ROSTER* roster) const;


};

#endif //_TRAININGBRIEFANDDEBRIEFFOREVAFDRULEPARAM_H_
