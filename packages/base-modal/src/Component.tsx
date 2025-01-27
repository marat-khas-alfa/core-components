/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, {
    useCallback,
    useRef,
    useState,
    forwardRef,
    MouseEvent,
    KeyboardEvent,
    ReactNode,
    useEffect,
    useMemo,
    Ref,
    FC,
    MutableRefObject,
} from 'react';
import cn from 'classnames';
import mergeRefs from 'react-merge-refs';
import { ResizeObserver as ResizeObserverPolyfill } from '@juggle/resize-observer';
import { CSSTransition } from 'react-transition-group';
import { TransitionProps } from 'react-transition-group/Transition';
import FocusLock from 'react-focus-lock';

import { Portal, PortalProps } from '@alfalab/core-components-portal';
import { Backdrop as DefaultBackdrop, BackdropProps } from '@alfalab/core-components-backdrop';
import { Stack, stackingOrder } from '@alfalab/core-components-stack';

import {
    handleContainer,
    hasScrollbar,
    isScrolledToBottom,
    isScrolledToTop,
    restoreContainerStyles,
} from './utils';

import styles from './index.module.css';

export type BaseModalProps = {
    /**
     * Контент
     */
    children?: ReactNode;

    /**
     * Компонент бэкдропа
     */
    Backdrop?: FC<BackdropProps>;

    /**
     * Свойства для Бэкдропа
     */
    backdropProps?: Partial<BackdropProps> & Record<string, unknown>;

    /**
     * Нода, компонент или функция возвращающая их
     *
     * Контейнер к которому будут добавляться порталы
     */
    container?: PortalProps['getPortalContainer'];

    /**
     * Отключает автоматический перевод фокуса на модалку при открытии
     * @default false
     */
    disableAutoFocus?: boolean;

    /**
     * Отключает ловушку фокуса
     * @default false
     */
    disableFocusLock?: boolean;

    /**
     * Отключает восстановление фокуса на предыдущем элементе после закрытия модалки
     * @default false
     */
    disableRestoreFocus?: boolean;

    /**
     * Отключает вызов `callback` при нажатии Escape
     * @default false
     */
    disableEscapeKeyDown?: boolean;

    /**
     * Отключает вызов `callback` при клике на бэкдроп
     * @default false
     */
    disableBackdropClick?: boolean;

    /**
     * Содержимое модалки всегда в DOM
     * @default false
     */
    keepMounted?: boolean;

    /**
     * Управление видимостью модалки
     */
    open: boolean;

    /**
     * Дополнительный класс
     */
    className?: string;

    /**
     * Дополнительный класс
     */
    contentClassName?: string;

    /**
     * Дополнительный класс для обертки (Modal)
     */
    wrapperClassName?: string;

    /**
     * Обработчик скролла контента
     */
    scrollHandler?: 'wrapper' | 'content' | MutableRefObject<HTMLDivElement | null>;

    /**
     * Пропсы для анимации (CSSTransition)
     */
    transitionProps?: Partial<TransitionProps>;

    /**
     * Обработчик события нажатия на бэкдроп
     */
    onBackdropClick?: (event: MouseEvent) => void;

    /**
     * Обработчик события нажатия на Escape
     *
     * Если `disableEscapeKeyDown` - false и модальное окно в фокусе
     */
    onEscapeKeyDown?: (event: KeyboardEvent) => void;

    /**
     * Обработчик закрытия
     */
    onClose?: (
        event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
        reason?: 'backdropClick' | 'escapeKeyDown' | 'closerClick',
    ) => void;

    /**
     * Обработчик события onEntered компонента Transition
     */
    onMount?: () => void;

    /**
     * Обработчик события onExited компонента Transition
     */
    onUnmount?: () => void;

    /**
     * Идентификатор для систем автоматизированного тестирования
     */
    dataTestId?: string;

    /**
     * z-index компонента
     */
    zIndex?: number;

    /**
     * Реф, который должен быть установлен компонентной области
     */
    componentRef?: MutableRefObject<HTMLDivElement | null>;
};

export type BaseModalContext = {
    hasFooter?: boolean;
    hasHeader?: boolean;
    hasScroll?: boolean;
    headerHighlighted?: boolean;
    footerHighlighted?: boolean;
    headerOffset?: number;
    setHeaderOffset: (offset: number) => void;
    contentRef: Ref<HTMLElement>;
    setHasHeader: (exists: boolean) => void;
    setHasFooter: (exists: boolean) => void;
    onClose: Required<BaseModalProps>['onClose'];
};

export const BaseModalContext = React.createContext<BaseModalContext>({
    hasFooter: false,
    hasHeader: false,
    hasScroll: false,
    headerHighlighted: false,
    footerHighlighted: false,
    headerOffset: 0,
    setHeaderOffset: () => null,
    contentRef: () => null,
    setHasHeader: () => null,
    setHasFooter: () => null,
    onClose: () => null,
});

export const BaseModal = forwardRef<HTMLDivElement, BaseModalProps>(
    (
        {
            open,
            container,
            children,
            scrollHandler = 'wrapper',
            Backdrop = DefaultBackdrop,
            backdropProps = {},
            transitionProps = {},
            disableBackdropClick,
            disableAutoFocus = false,
            disableFocusLock = false,
            disableEscapeKeyDown = false,
            disableRestoreFocus = false,
            keepMounted = false,
            className,
            contentClassName,
            wrapperClassName,
            onBackdropClick,
            onClose,
            onEscapeKeyDown,
            onMount,
            onUnmount,
            dataTestId,
            zIndex = stackingOrder.MODAL,
            componentRef = null,
        },
        ref,
    ) => {
        const [exited, setExited] = useState(!open);
        const [hasScroll, setHasScroll] = useState(false);
        const [hasHeader, setHasHeader] = useState(false);
        const [hasFooter, setHasFooter] = useState(false);
        const [headerHighlighted, setHeaderHighlighted] = useState(false);
        const [footerHighlighted, setFooterHighlighted] = useState(false);
        const [headerOffset, setHeaderOffset] = useState(0);

        const componentNodeRef = useRef<HTMLDivElement>(null);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const scrollableNodeRef = useRef<HTMLDivElement | null>(null);
        const contentNodeRef = useRef<HTMLDivElement | null>(null);
        const restoreContainerStylesRef = useRef<null | Function>(null);
        const mouseDownTarget = useRef<HTMLElement>();
        const resizeObserverRef = useRef<ResizeObserver>();

        const checkToHasScrollBar = () => {
            if (scrollableNodeRef.current) {
                const scrollExists = hasScrollbar(scrollableNodeRef.current);
                setFooterHighlighted(scrollExists);
                setHasScroll(scrollExists);
            }
        };

        const shouldRender = keepMounted || open || !exited;

        const getContainer = useCallback(() => {
            return (container ? container() : document.body) as HTMLElement;
        }, [container]);

        const addResizeHandle = useCallback(() => {
            if (!resizeObserverRef.current) return;

            if (scrollableNodeRef.current) {
                resizeObserverRef.current.observe(scrollableNodeRef.current);
            }
            if (contentNodeRef.current) {
                resizeObserverRef.current.observe(contentNodeRef.current);
            }
        }, []);

        const removeResizeHandle = useCallback(() => resizeObserverRef.current?.disconnect(), []);

        const contentRef = useCallback((node: HTMLDivElement) => {
            if (node !== null) {
                contentNodeRef.current = node;
                if (resizeObserverRef.current) {
                    resizeObserverRef.current.observe(node);
                }
                checkToHasScrollBar();
            }
        }, []);

        const handleScroll = useCallback(() => {
            if (!scrollableNodeRef.current || !componentNodeRef.current) return;

            if (hasHeader) {
                setHeaderHighlighted(
                    !isScrolledToTop(scrollableNodeRef.current) &&
                        componentNodeRef.current.getBoundingClientRect().top - headerOffset <= 0,
                );
            }

            if (hasFooter) {
                setFooterHighlighted(
                    !isScrolledToBottom(scrollableNodeRef.current) &&
                        componentNodeRef.current.getBoundingClientRect().bottom >=
                            window.innerHeight,
                );
            }
        }, [hasFooter, hasHeader, headerOffset]);

        const handleClose = useCallback<Required<BaseModalProps>['onClose']>(
            (event, reason) => {
                if (onClose) {
                    onClose(event, reason);
                }

                if (reason === 'backdropClick' && onBackdropClick) {
                    onBackdropClick(event as MouseEvent);
                }

                if (reason === 'escapeKeyDown' && onEscapeKeyDown) {
                    onEscapeKeyDown(event as KeyboardEvent);
                }

                return null;
            },
            [onBackdropClick, onClose, onEscapeKeyDown],
        );

        const handleBackdropMouseDown = (event: MouseEvent<HTMLElement>) => {
            if (!disableBackdropClick) {
                mouseDownTarget.current = event.target as HTMLElement;
            }
        };

        const handleBackdropMouseUp = (event: MouseEvent<HTMLElement>) => {
            if (
                !disableBackdropClick &&
                event.target === wrapperRef.current &&
                mouseDownTarget.current === wrapperRef.current
            ) {
                handleClose(event, 'backdropClick');
            }
        };

        const handleKeyDown = useCallback(
            (event: KeyboardEvent<HTMLDivElement>) => {
                /*
                 * Чтобы сохранить дефолтное поведение элементов и событий форм,
                 * обработчик не устанавливает event.preventDefault()
                 */
                if (event.key !== 'Escape') {
                    return;
                }

                // Если есть обработчик escape на body
                event.stopPropagation();

                if (!disableEscapeKeyDown && handleClose) {
                    handleClose(event, 'escapeKeyDown');
                }
            },
            [disableEscapeKeyDown, handleClose],
        );

        const getScrollHandler = useCallback(() => {
            if (scrollHandler === 'wrapper') return wrapperRef.current;
            if (scrollHandler === 'content') return componentNodeRef.current;
            return scrollHandler.current || wrapperRef.current;
        }, [scrollHandler]);

        const handleEntered: Required<TransitionProps>['onEntered'] = useCallback(
            (node, isAppearing) => {
                scrollableNodeRef.current = getScrollHandler();

                addResizeHandle();

                if (scrollableNodeRef.current) {
                    scrollableNodeRef.current.addEventListener('scroll', handleScroll);
                    handleScroll();
                }

                if (transitionProps.onEntered) {
                    transitionProps.onEntered(node, isAppearing);
                }

                if (onMount) onMount();
            },
            [addResizeHandle, getScrollHandler, handleScroll, onMount, transitionProps],
        );

        const handleExited: Required<TransitionProps>['onExited'] = useCallback(
            node => {
                removeResizeHandle();

                setExited(true);

                if (scrollableNodeRef.current) {
                    scrollableNodeRef.current.removeEventListener('scroll', handleScroll);
                }

                if (transitionProps.onExited) {
                    transitionProps.onExited(node);
                }

                if (onUnmount) onUnmount();

                if (restoreContainerStylesRef.current) {
                    restoreContainerStylesRef.current();
                }
            },
            [handleScroll, onUnmount, removeResizeHandle, transitionProps],
        );

        useEffect(() => {
            if (open) {
                handleContainer(getContainer());

                restoreContainerStylesRef.current = () => {
                    restoreContainerStylesRef.current = null;
                    restoreContainerStyles(getContainer());
                };
            }
        }, [getContainer, open]);

        useEffect(() => {
            if (open) setExited(false);
        }, [open]);

        useEffect(() => {
            const ResizeObserver = window.ResizeObserver || ResizeObserverPolyfill;

            resizeObserverRef.current = new ResizeObserver(checkToHasScrollBar);

            return () => {
                if (restoreContainerStylesRef.current) {
                    restoreContainerStylesRef.current();
                }

                if (resizeObserverRef.current) {
                    resizeObserverRef.current.disconnect();
                }
            };
        }, []);

        const contextValue = useMemo<BaseModalContext>(
            () => ({
                hasHeader,
                hasFooter,
                hasScroll,
                headerHighlighted,
                footerHighlighted,
                headerOffset,
                setHeaderOffset,
                contentRef,
                setHasHeader,
                setHasFooter,
                onClose: handleClose,
            }),
            [
                contentRef,
                hasHeader,
                hasFooter,
                hasScroll,
                headerHighlighted,
                footerHighlighted,
                headerOffset,
                setHeaderOffset,
                handleClose,
            ],
        );

        if (!shouldRender) return null;

        return (
            <Stack value={zIndex}>
                {computedZIndex => (
                    <Portal getPortalContainer={container}>
                        <BaseModalContext.Provider value={contextValue}>
                            <FocusLock
                                autoFocus={!disableAutoFocus}
                                disabled={disableFocusLock || !open}
                                returnFocus={!disableRestoreFocus}
                            >
                                {Backdrop && (
                                    <Backdrop
                                        {...backdropProps}
                                        className={cn(backdropProps.className, styles.backdrop)}
                                        open={open}
                                        style={{
                                            zIndex: computedZIndex,
                                        }}
                                    />
                                )}
                                <div
                                    role='dialog'
                                    className={cn(styles.wrapper, wrapperClassName, {
                                        [styles.hidden]: !open && exited,
                                    })}
                                    ref={mergeRefs([ref, wrapperRef])}
                                    onKeyDown={handleKeyDown}
                                    onMouseDown={handleBackdropMouseDown}
                                    onMouseUp={handleBackdropMouseUp}
                                    tabIndex={-1}
                                    data-test-id={dataTestId}
                                    style={{
                                        zIndex: computedZIndex,
                                    }}
                                >
                                    <CSSTransition
                                        appear={true}
                                        timeout={200}
                                        classNames={styles}
                                        {...transitionProps}
                                        in={open}
                                        onEntered={handleEntered}
                                        onExited={handleExited}
                                    >
                                        <div
                                            className={cn(styles.component, className)}
                                            ref={mergeRefs([componentRef, componentNodeRef])}
                                        >
                                            <div className={cn(styles.content, contentClassName)}>
                                                {children}
                                            </div>
                                        </div>
                                    </CSSTransition>
                                </div>
                            </FocusLock>
                        </BaseModalContext.Provider>
                    </Portal>
                )}
            </Stack>
        );
    },
);
