//
// Created by haoli on 2025/8/18.
//

#ifndef TRAININGOPTIMIZER_CONCRETECONVERTER_H
#define TRAININGOPTIMIZER_CONCRETECONVERTER_H

#include "any"
#include "IConverter.h"
#include "spdlog/spdlog.h"
#include "stdexcept"
#include "ConcreteConverterHelper/ConverterHelperHeader.h"

template<typename SourceType, typename TargetType>
class ConcreteConverter : public IConverter {
public:
    [[nodiscard]] std::optional<TargetVariant> Convert(const std::any& src) const override {
        try {
            const SourceType &sourceData = std::any_cast<const SourceType &>(src);
            if (auto result = ConvertImpl(sourceData))
                return result;
            return std::nullopt;
        } catch (const std::bad_any_cast& e) {
            spdlog::error("Type mismatch in conversion (" + TypeName() + "): " + e.what());
            return std::nullopt;
        } catch (const std::exception& e) {
            spdlog::error("Conversion error (" + TypeName() + "): " + e.what());
            return std::nullopt;
        }
    }

    [[nodiscard]] std::string TypeName() const override {
        return std::string(typeid(SourceType).name()) + " -> " + std::string(typeid(TargetType).name());
    }

private:
    TargetType *ConvertImpl(const SourceType &src) const {
        return ConverterHelper<SourceType, TargetType>::Convert(src);
    }
};


#endif //TRAININGOPTIMIZER_CONCRETECONVERTER_H
