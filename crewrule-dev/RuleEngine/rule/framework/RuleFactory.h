#ifndef NEWRULEENGINE_RULEFACTORY_H
#define NEWRULEENGINE_RULEFACTORY_H

#include <vector>
#include <unordered_map>
#include <memory>
#include "BasicRule.h"
#include "RuleSystemDefine.h"
#include "Rule.h"
#include "RuleEngine.h"

class RuleFactory {

public:
	explicit RuleFactory(const LegalityChecker& legalityChecker):_legalityChecker(legalityChecker) {};

	/*
	 * The only way to init new rule
	 * NOTE:
	 * 1. only take rvalue enforce move
	 * 2. use template to enforce definition of InputType of each specific rule
	 */
	template<class SubRule>
	void InitCheckRule(typename SubRule::InputType&& args, const std::string ruleName = "DEFAULT") {
		auto rule = std::make_unique<SubRule>(nullptr, std::forward<typename SubRule::InputType&&>(args));
		/*rule.setDataContext(this->_dbData);
		rule.setApplication(this->_application);*/
		rule->setDataContext(_legalityChecker._dbData);
		rule->setApplication(_legalityChecker._application);
		rule->setDebugModel(_legalityChecker.DebugMode());
		rule->setRuleViolation(&(_legalityChecker._rule_violations));
		rule->setViolations(&(_legalityChecker._violations));

		auto iter = _checkRuleMapLocation.find(SubRule::RuleFuncId);
		if (iter == _checkRuleMapLocation.end()) {
			auto ruleNameMap = std::unordered_map<std::string, std::unique_ptr<Rule>>();
			_checkRuleMapLocation.insert({ SubRule::RuleFuncId, std::move(ruleNameMap)});
			iter = _checkRuleMapLocation.find(SubRule::RuleFuncId);
		}
		iter->second.insert({ruleName, std::move(rule)});
	}

	template<class SubRule>
	void InitCalcRule(typename SubRule::InputType&& args, const std::string ruleName= "DEFAULT") {
		auto rule = std::make_unique<SubRule>(nullptr, std::forward<typename SubRule::InputType&&>(args));
		/*rule.setDataContext(this->_dbData);
		rule.setApplication(this->_application);*/
		rule->setDataContext(_legalityChecker._dbData);
		rule->setApplication(_legalityChecker._application);
		rule->setDebugModel(_legalityChecker.DebugMode());
		rule->setRuleViolation(&(_legalityChecker._rule_violations));
		rule->setViolations(&(_legalityChecker._violations));

		auto iter = _calcRuleMapLocation.find(SubRule::RuleFuncId);
		if (iter == _calcRuleMapLocation.end()) {
			auto ruleNameMap = std::unordered_map<std::string, std::unique_ptr<Rule>>();
			_calcRuleMapLocation.insert({ SubRule::RuleFuncId, std::move(ruleNameMap) });
			iter = _calcRuleMapLocation.find(SubRule::RuleFuncId);
		}
		iter->second.insert({ ruleName, std::move(rule) });
	}

	template<class SubRule>
	SubRule * GetCheckRule(const std::string ruleName = "DEFAULT") const {
		const auto it = _checkRuleMapLocation.find(SubRule::RuleFuncId);
		if (it != _checkRuleMapLocation.end()) {
			// return (SubRule*)it->second.get();
			auto& ruleNameMap = it->second;
			return dynamic_cast<SubRule*>(ruleNameMap.at(ruleName).get());
		}
		return nullptr;
	}

	BasicRule* GetCheckBasicRuleByFunction(unsigned int ruleFuncId, const std::string ruleName = "DEFAULT") const {
		const auto it = _checkRuleMapLocation.find(ruleFuncId);
		if (it == _checkRuleMapLocation.end()) {
			return nullptr;
		}
		const auto& ruleNameMap = it->second;
		const auto ruleIt = ruleNameMap.find(ruleName);
		if (ruleIt == ruleNameMap.end()) {
			return nullptr;
		}
		return dynamic_cast<BasicRule*>(ruleIt->second.get());
	}

	template<class SubRule>
	SubRule * GetCalcRule(const std::string ruleName = "DEFAULT") const {
		const auto it = _calcRuleMapLocation.find(SubRule::RuleFuncId);
		if (it != _calcRuleMapLocation.end()) {
			// return (SubRule*)it->second.get();
			auto& ruleNameMap = it->second;
			return dynamic_cast<SubRule*>(ruleNameMap.at(ruleName).get());
		}
		return nullptr;
	}

private:
	const LegalityChecker& _legalityChecker;

	std::unordered_map<unsigned int, std::unordered_map<std::string,std::unique_ptr<Rule>>> _checkRuleMapLocation;
	std::unordered_map<unsigned int, std::unordered_map<std::string, std::unique_ptr<Rule>>> _calcRuleMapLocation;

};

#endif
