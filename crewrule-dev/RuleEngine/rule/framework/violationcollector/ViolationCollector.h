/**
 * @file ViolationCollector.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-17
**/


#ifndef NEWRULEENGINE_VIOLATIONCOLLECTOR_H
#define NEWRULEENGINE_VIOLATIONCOLLECTOR_H

#include <vector>
#include <memory>
#include <mutex>
#include <algorithm>
#include <iterator>
#include "Violation.h"

class ViolationCollector{
public:
    ViolationCollector() = default;
    explicit ViolationCollector(const ViolationSeverity& severity): _severityLevel(severity) {}
    ~ViolationCollector() { ClearViolation(); }

    // This only way to create Violation and modify created Violation is through this method
    // Note: This is no need to modify Violation anywhere other than where it's been created
    Violation* AddViolation(const ViolationType& type, const ViolationSeverity& severity, const unsigned int& ruleFuncId) {
        if (!ShouldAddViolation(severity)) return nullptr;
        std::unique_lock<std::mutex> lock(_violationVectorMutex);
        // the reason not using make_unique is that friend function partial specification is not allowed,
        // in order to save friend specification coding, avoid using make_unique function to directly create unique_ptr
        _violations.emplace_back(std::unique_ptr<Violation>(new Violation(type, severity, ruleFuncId)));
        return _violations.back().get();
    }

    // Get all violations as const Ptr, avoid modifying and thus thread-safety
    std::vector<const Violation*> GetAllViolations() const {
        std::vector<const Violation*> result;
        result.reserve(_violations.size());
        std::transform(_violations.cbegin(), _violations.cend(), std::back_inserter(result),
                       [](const auto& uniquePtr) { return uniquePtr.get(); });
        return result;
    }
    void ClearViolation() { _violations.clear(); }
    void SetSeverityLevel(ViolationSeverity&& severity) { _severityLevel = severity; }

private:

    bool ShouldAddViolation(const ViolationSeverity& severity) const {
        return enum_to_underlying(severity) >= enum_to_underlying(_severityLevel.load(std::memory_order_relaxed));
    }

    std::mutex _violationVectorMutex;
    std::vector<std::unique_ptr<Violation>> _violations;
    std::atomic<ViolationSeverity> _severityLevel{DefaultSeverity};
};

#endif //NEWRULEENGINE_VIOLATIONCOLLECTOR_H
